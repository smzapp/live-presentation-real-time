import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Participant, Room, StageMode, Stroke } from './room.types.js';

// The parts of a room that are written independently. "meta" is the small
// scalar stuff (mode, slide, grid, activity time); the rest are the JSON
// columns, which can get large, so they're only rewritten when they changed.
export type RoomField = 'meta' | 'strokes' | 'slides' | 'chat' | 'participants';

interface Pending {
  room: Room;
  fields: Set<RoomField>;
  boards: Set<string>;
  timer: NodeJS.Timeout | null;
}

// Changes are batched and written shortly after they happen instead of on
// every event — a pen stroke streams dozens of updates a second. A crash
// loses at most this much; a clean shutdown flushes everything first.
const FLUSH_DELAY_MS = 1500;

type LiveRoomRow = Prisma.LiveRoomGetPayload<{ include: { boards: true } }>;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function serializeParticipants(room: Room) {
  return Array.from(room.participants.values()).map(
    ({ socketId: _socketId, ...rest }) => rest,
  );
}

// Nobody's socket survives a restart, so everyone comes back offline with
// their media off; they're matched up again when their client reconnects.
function toRoom(row: LiveRoomRow): Room {
  const participants = new Map<string, Participant>();
  for (const p of (row.participants as unknown as Omit<Participant, 'socketId'>[]) ?? []) {
    participants.set(p.id, { ...p, socketId: '', camOn: false, micOn: false });
  }
  const personalStrokes = new Map<string, Stroke[]>();
  for (const board of row.boards) {
    personalStrokes.set(board.participantId, board.strokes as unknown as Stroke[]);
  }
  return {
    code: row.code,
    title: row.title,
    hostToken: row.hostToken,
    hostSocketId: null,
    hostMedia: { camOn: false, micOn: false },
    mode: row.mode as StageMode,
    slideIndex: row.slideIndex,
    gridVisible: row.gridVisible,
    strokes: row.strokes as unknown as Room['strokes'],
    slides: row.slides as unknown as Room['slides'],
    chat: row.chat as unknown as Room['chat'],
    participants,
    personalStrokes,
    screenShare: null,
    createdAt: row.createdAt.getTime(),
    lastActivityAt: row.lastActivityAt.getTime(),
  };
}

@Injectable()
export class RoomStore implements BeforeApplicationShutdown {
  private readonly logger = new Logger(RoomStore.name);
  private readonly pending = new Map<string, Pending>();
  // Per-room write chain, so two flushes of the same room never race and
  // land out of order.
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  async create(room: Room) {
    await this.prisma.liveRoom.create({
      data: {
        code: room.code,
        title: room.title,
        hostToken: room.hostToken,
        mode: room.mode,
        slideIndex: room.slideIndex,
        gridVisible: room.gridVisible,
        createdAt: new Date(room.createdAt),
        lastActivityAt: new Date(room.lastActivityAt),
      },
    });
  }

  async codeExists(code: string) {
    return (await this.prisma.liveRoom.count({ where: { code } })) > 0;
  }

  async load(code: string): Promise<Room | undefined> {
    const row = await this.prisma.liveRoom.findUnique({
      where: { code },
      include: { boards: true },
    });
    return row ? toRoom(row) : undefined;
  }

  async loadActiveSince(since: Date): Promise<Room[]> {
    const rows = await this.prisma.liveRoom.findMany({
      where: { lastActivityAt: { gte: since } },
      include: { boards: true },
    });
    return rows.map(toRoom);
  }

  markDirty(room: Room, ...fields: RoomField[]) {
    const entry = this.entry(room);
    for (const field of fields) entry.fields.add(field);
    this.schedule(entry);
  }

  markBoardDirty(room: Room, participantId: string) {
    const entry = this.entry(room);
    entry.boards.add(participantId);
    entry.fields.add('meta');
    this.schedule(entry);
  }

  flush(code: string): Promise<void> {
    const entry = this.pending.get(code);
    if (!entry) return this.inflight.get(code) ?? Promise.resolve();
    if (entry.timer) clearTimeout(entry.timer);
    this.pending.delete(code);

    const previous = this.inflight.get(code) ?? Promise.resolve();
    const next = previous
      .then(() => this.write(entry))
      .catch((err) => this.logger.error(`Could not save room ${code}`, err))
      .finally(() => {
        if (this.inflight.get(code) === next) this.inflight.delete(code);
      });
    this.inflight.set(code, next);
    return next;
  }

  async flushAll() {
    const codes = new Set([...this.pending.keys(), ...this.inflight.keys()]);
    await Promise.all([...codes].map((code) => this.flush(code)));
  }

  async purgeInactiveBefore(cutoff: Date) {
    const { count } = await this.prisma.liveRoom.deleteMany({
      where: { lastActivityAt: { lt: cutoff } },
    });
    return count;
  }

  async beforeApplicationShutdown() {
    await this.flushAll();
  }

  private entry(room: Room): Pending {
    let entry = this.pending.get(room.code);
    if (!entry) {
      entry = { room, fields: new Set(), boards: new Set(), timer: null };
      this.pending.set(room.code, entry);
    }
    return entry;
  }

  private schedule(entry: Pending) {
    if (entry.timer) return;
    entry.timer = setTimeout(() => void this.flush(entry.room.code), FLUSH_DELAY_MS);
    entry.timer.unref();
  }

  // Values are read from the live room at write time, not when marked, so a
  // flush always stores the latest state even if it was marked long ago.
  private async write({ room, fields, boards }: Pending) {
    const data: Prisma.LiveRoomUpdateInput = {
      title: room.title,
      mode: room.mode,
      slideIndex: room.slideIndex,
      gridVisible: room.gridVisible,
      lastActivityAt: new Date(room.lastActivityAt),
    };
    if (fields.has('strokes')) data.strokes = json(room.strokes);
    if (fields.has('slides')) data.slides = json(room.slides);
    if (fields.has('chat')) data.chat = json(room.chat);
    if (fields.has('participants')) data.participants = json(serializeParticipants(room));

    const boardWrites = [...boards].map((participantId) => {
      const strokes = room.personalStrokes.get(participantId);
      const where = { roomCode_participantId: { roomCode: room.code, participantId } };
      if (!strokes) {
        return this.prisma.liveRoomBoard.deleteMany({
          where: { roomCode: room.code, participantId },
        });
      }
      return this.prisma.liveRoomBoard.upsert({
        where,
        create: { roomCode: room.code, participantId, strokes: json(strokes) },
        update: { strokes: json(strokes) },
      });
    });

    await this.prisma.$transaction([
      this.prisma.liveRoom.update({ where: { code: room.code }, data }),
      ...boardWrites,
    ]);
  }
}
