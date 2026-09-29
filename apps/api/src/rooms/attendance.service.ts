import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Participant, Room } from './room.types.js';

// What a participant did, beyond simply being there.
export type ParticipationKind = 'strokes' | 'chatMessages' | 'handRaises' | 'reactions';

interface Entry {
  roomCode: string;
  participantId: string;
  name: string;
  firstJoinedAt: Date;
  lastSeenAt: Date;
  // Time already banked from finished connections. Time from the current
  // connection is added in at flush (see settle).
  presentMs: number;
  onlineSince: number | null;
  joins: number;
  strokes: number;
  chatMessages: number;
  handRaises: number;
  reactions: number;
  wasOnStage: boolean;
}

// Counters are batched like room state is (see RoomStore): a class drawing
// generates dozens of events a second, and none of them is worth a write of
// its own. A crash loses at most this much participation detail.
const FLUSH_INTERVAL_MS = 20_000;

@Injectable()
export class AttendanceService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(AttendanceService.name);
  // `${roomCode}:${participantId}` -> counters awaiting a write.
  private readonly entries = new Map<string, Entry>();
  private readonly sessions = new Map<string, { title: string; ownerId: string | null; peakOnline: number }>();
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {
    setInterval(() => void this.flush(), FLUSH_INTERVAL_MS).unref();
  }

  // The register outlives the session itself (rooms are deleted a week after
  // they go quiet), so the title and host are copied in here.
  async sessionStarted(room: Room) {
    try {
      await this.prisma.sessionLog.upsert({
        where: { code: room.code },
        create: {
          code: room.code,
          title: room.title,
          ownerId: room.ownerId,
          startedAt: new Date(room.createdAt),
          lastActivityAt: new Date(room.lastActivityAt),
        },
        update: { title: room.title, lastActivityAt: new Date(room.lastActivityAt) },
      });
    } catch (err) {
      this.logger.error(`Could not record the start of session ${room.code}`, err);
    }
  }

  joined(room: Room, participant: Participant, onlineCount: number) {
    const entry = this.entry(room.code, participant.id, participant.name);
    entry.name = participant.name || entry.name;
    entry.lastSeenAt = new Date();
    // A rejoin after a dropped connection counts as another join, but the
    // first one still dates the row.
    if (entry.onlineSince === null) {
      entry.onlineSince = Date.now();
      entry.joins += 1;
    }
    if (participant.onStage) entry.wasOnStage = true;

    const session = this.sessions.get(room.code);
    const peak = Math.max(session?.peakOnline ?? 0, onlineCount);
    this.sessions.set(room.code, { title: room.title, ownerId: room.ownerId, peakOnline: peak });
  }

  left(roomCode: string, participantId: string) {
    const entry = this.entries.get(this.key(roomCode, participantId));
    if (!entry) return;
    this.settle(entry);
    entry.onlineSince = null;
  }

  record(roomCode: string, participantId: string, kind: ParticipationKind, by = 1) {
    const entry = this.entries.get(this.key(roomCode, participantId));
    if (!entry) return;
    entry[kind] += by;
    entry.lastSeenAt = new Date();
  }

  wentOnStage(roomCode: string, participantId: string) {
    const entry = this.entries.get(this.key(roomCode, participantId));
    if (entry) entry.wasOnStage = true;
  }

  renamed(roomCode: string, participantId: string, name: string) {
    const entry = this.entries.get(this.key(roomCode, participantId));
    if (entry && name.trim()) entry.name = name.trim();
  }

  // Writes everything buffered so far. Reports call this first, so a session
  // that's still running reads back what's happening in it right now.
  flush(): Promise<void> {
    const entries = [...this.entries.values()];
    const sessions = [...this.sessions.entries()];
    this.sessions.clear();
    if (entries.length === 0 && sessions.length === 0) return this.writing;

    const now = Date.now();
    for (const entry of entries) this.settle(entry, now);
    // Only people who have left are dropped from memory; anyone still
    // connected keeps their entry so their counters go on accumulating.
    for (const [key, entry] of this.entries) {
      if (entry.onlineSince === null) this.entries.delete(key);
    }

    const snapshot = entries.map((entry) => ({ ...entry }));
    this.writing = this.writing
      .then(() => this.write(snapshot, sessions))
      .catch((err) => this.logger.error('Could not save attendance', err));
    return this.writing;
  }

  async beforeApplicationShutdown() {
    await this.flush();
  }

  private key(roomCode: string, participantId: string) {
    return `${roomCode}:${participantId}`;
  }

  private entry(roomCode: string, participantId: string, name: string): Entry {
    const key = this.key(roomCode, participantId);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        roomCode,
        participantId,
        name: name || 'Guest',
        firstJoinedAt: new Date(),
        lastSeenAt: new Date(),
        presentMs: 0,
        onlineSince: null,
        joins: 0,
        strokes: 0,
        chatMessages: 0,
        handRaises: 0,
        reactions: 0,
        wasOnStage: false,
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  // Banks the time spent connected so far and restarts the clock, so time is
  // counted exactly once however often this runs.
  private settle(entry: Entry, now = Date.now()) {
    if (entry.onlineSince === null) return;
    entry.presentMs += Math.max(0, now - entry.onlineSince);
    entry.onlineSince = now;
  }

  // Counters are written as increments, not totals: what's in memory is only
  // what happened since the last flush, so two API instances sharing a
  // database can't overwrite each other's work.
  private async write(
    entries: Entry[],
    sessions: [string, { title: string; ownerId: string | null; peakOnline: number }][],
  ) {
    for (const [code, session] of sessions) {
      await this.prisma.sessionLog.upsert({
        where: { code },
        create: {
          code,
          title: session.title,
          ownerId: session.ownerId,
          peakOnline: session.peakOnline,
        },
        update: { title: session.title, lastActivityAt: new Date() },
      });
      // Raise the high-water mark without lowering it, which a plain set
      // would do when another instance saw a bigger crowd.
      await this.prisma.sessionLog.updateMany({
        where: { code, peakOnline: { lt: session.peakOnline } },
        data: { peakOnline: session.peakOnline },
      });
    }

    for (const entry of entries) {
      const increments = {
        presentMs: entry.presentMs,
        joins: entry.joins,
        strokes: entry.strokes,
        chatMessages: entry.chatMessages,
        handRaises: entry.handRaises,
        reactions: entry.reactions,
      };
      await this.prisma.sessionAttendance.upsert({
        where: {
          roomCode_participantId: { roomCode: entry.roomCode, participantId: entry.participantId },
        },
        create: {
          roomCode: entry.roomCode,
          participantId: entry.participantId,
          name: entry.name,
          firstJoinedAt: entry.firstJoinedAt,
          lastSeenAt: entry.lastSeenAt,
          wasOnStage: entry.wasOnStage,
          ...increments,
        },
        update: {
          name: entry.name,
          lastSeenAt: entry.lastSeenAt,
          ...(entry.wasOnStage ? { wasOnStage: true } : {}),
          presentMs: { increment: increments.presentMs },
          joins: { increment: increments.joins },
          strokes: { increment: increments.strokes },
          chatMessages: { increment: increments.chatMessages },
          handRaises: { increment: increments.handRaises },
          reactions: { increment: increments.reactions },
        },
      });
    }

    // Written: everything above has been banked, so the in-memory copy
    // starts again from zero.
    for (const entry of entries) {
      const live = this.entries.get(this.key(entry.roomCode, entry.participantId));
      if (!live) continue;
      live.presentMs -= entry.presentMs;
      live.joins -= entry.joins;
      live.strokes -= entry.strokes;
      live.chatMessages -= entry.chatMessages;
      live.handRaises -= entry.handRaises;
      live.reactions -= entry.reactions;
    }
  }
}
