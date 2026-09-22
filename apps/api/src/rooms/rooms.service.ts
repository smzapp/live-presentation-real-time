import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import type {
  ChatMessage,
  Participant,
  Room,
  RoomSnapshot,
  Slide,
  StageMode,
  Stroke,
} from './room.types.js';
import { RoomStore } from './room-store.service.js';
import { SettingsService } from '../platform/settings.service.js';
import { allowedTools, optionForStrokeTool } from '../platform/drawing-tools.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateCode = customAlphabet(CODE_ALPHABET, 6);
const generateId = customAlphabet(
  'abcdefghijklmnopqrstuvwxyz0123456789',
  16,
);

const MAX_SHARED_STROKES = 4000;
const MAX_PERSONAL_STROKES = 1500;
const MAX_CHAT_MESSAGES = 500;
// Idle rooms leave memory after this long; they stay in the database and are
// loaded back the next time someone joins.
const ROOM_IDLE_TTL_MS = 3 * 60 * 60 * 1000;
// ...and are deleted from the database after this long without activity.
const ROOM_RETENTION_MS =
  Number(process.env.ROOM_RETENTION_DAYS ?? 7) * 24 * 60 * 60 * 1000;
// How long a participant whose connection dropped (or who was in the room
// when the server restarted) keeps their seat and personal board.
const RECONNECT_GRACE_MS = 2 * 60 * 1000;

@Injectable()
export class RoomsService implements OnModuleInit {
  private readonly logger = new Logger(RoomsService.name);
  private readonly rooms = new Map<string, Room>();
  private readonly loading = new Map<string, Promise<Room | undefined>>();
  private readonly offlineTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly store: RoomStore,
    private readonly settings: SettingsService,
  ) {
    setInterval(() => void this.sweepIdleRooms(), 15 * 60 * 1000).unref();
  }

  // Bring back every room that was active recently, so clients that were
  // connected when the server went down can rejoin the moment it's back.
  async onModuleInit() {
    const rooms = await this.store.loadActiveSince(
      new Date(Date.now() - ROOM_IDLE_TTL_MS),
    );
    for (const room of rooms) this.adopt(room);
    if (rooms.length) this.logger.log(`Restored ${rooms.length} live room(s)`);
  }

  async createRoom(title: string, owner?: { id: string; premiumTools: boolean }): Promise<Room> {
    let code = generateCode();
    while (this.rooms.has(code) || (await this.store.codeExists(code))) {
      code = generateCode();
    }

    const room: Room = {
      code,
      title: title.trim() || 'Untitled session',
      hostToken: generateId(),
      ownerId: owner?.id ?? null,
      premiumTools: owner?.premiumTools ?? false,
      hostSocketId: null,
      hostMedia: { camOn: false, micOn: false },
      mode: 'whiteboard',
      slideIndex: 0,
      gridVisible: true,
      strokes: [],
      slides: [],
      chat: [],
      participants: new Map(),
      personalStrokes: new Map(),
      screenShare: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    // Written before the host gets their token, so the session is
    // recoverable from the very first second.
    await this.store.create(room);
    this.rooms.set(code, room);
    return room;
  }

  // In-memory only: for handlers acting on a room the client already joined.
  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  // Memory first, then the database — for joins and lookups, which may be the
  // first touch of a room since it was evicted or the server restarted.
  async loadRoom(code: string): Promise<Room | undefined> {
    const key = code.toUpperCase();
    const inMemory = this.rooms.get(key);
    if (inMemory) return inMemory;

    let pending = this.loading.get(key);
    if (!pending) {
      pending = this.store
        .load(key)
        .then((room) => (room ? this.adopt(room) : undefined))
        .finally(() => this.loading.delete(key));
      this.loading.set(key, pending);
    }
    return pending;
  }

  touch(room: Room) {
    room.lastActivityAt = Date.now();
    this.store.markDirty(room, 'meta', 'participants');
  }

  createOrResumeParticipant(
    room: Room,
    socketId: string,
    name: string,
    participantId?: string,
  ): Participant {
    const existing = participantId
      ? room.participants.get(participantId)
      : undefined;
    if (existing) {
      this.cancelOfflineTimer(room, existing.id);
      existing.socketId = socketId;
      existing.camOn = false;
      existing.micOn = false;
      if (name.trim()) existing.name = name.trim();
      return existing;
    }
    const participant: Participant = {
      id: generateId(),
      socketId,
      name: name.trim() || 'Guest',
      canDraw: false,
      canShareScreen: false,
      handRaised: false,
      onStage: false,
      camOn: false,
      micOn: false,
      joinedAt: Date.now(),
    };
    room.participants.set(participant.id, participant);
    return participant;
  }

  findParticipantBySocket(
    room: Room,
    socketId: string,
  ): Participant | undefined {
    for (const p of room.participants.values()) {
      if (p.socketId === socketId) return p;
    }
    return undefined;
  }

  addStroke(room: Room, stroke: Stroke) {
    room.strokes.push(stroke);
    if (room.strokes.length > MAX_SHARED_STROKES) {
      room.strokes.splice(0, room.strokes.length - MAX_SHARED_STROKES);
    }
    this.store.markDirty(room, 'strokes');
  }

  undoStroke(room: Room) {
    room.strokes.pop();
    this.store.markDirty(room, 'strokes');
  }

  updateStroke(room: Room, stroke: Stroke) {
    const index = room.strokes.findIndex((s) => s.id === stroke.id);
    if (index !== -1) room.strokes[index] = stroke;
    this.store.markDirty(room, 'strokes');
  }

  deleteStroke(room: Room, strokeId: string) {
    const before = room.strokes.length;
    room.strokes = room.strokes.filter((s) => s.id !== strokeId);
    if (room.strokes.length !== before) this.store.markDirty(room, 'strokes');
  }

  clearStrokes(room: Room) {
    room.strokes = [];
    this.store.markDirty(room, 'strokes');
  }

  setStrokes(room: Room, strokes: Stroke[]) {
    room.strokes =
      strokes.length > MAX_SHARED_STROKES
        ? strokes.slice(strokes.length - MAX_SHARED_STROKES)
        : strokes;
    this.store.markDirty(room, 'strokes');
  }

  setSlides(room: Room, slides: Slide[]) {
    room.slides = slides;
    this.store.markDirty(room, 'slides');
  }

  addPersonalStroke(room: Room, participantId: string, stroke: Stroke) {
    const list = room.personalStrokes.get(participantId) ?? [];
    list.push(stroke);
    if (list.length > MAX_PERSONAL_STROKES) {
      list.splice(0, list.length - MAX_PERSONAL_STROKES);
    }
    room.personalStrokes.set(participantId, list);
    this.store.markBoardDirty(room, participantId);
  }

  undoPersonalStroke(room: Room, participantId: string) {
    const list = room.personalStrokes.get(participantId);
    list?.pop();
    this.store.markBoardDirty(room, participantId);
  }

  updatePersonalStroke(room: Room, participantId: string, stroke: Stroke) {
    const list = room.personalStrokes.get(participantId);
    if (!list) return;
    const index = list.findIndex((s) => s.id === stroke.id);
    if (index !== -1) list[index] = stroke;
    this.store.markBoardDirty(room, participantId);
  }

  deletePersonalStroke(room: Room, participantId: string, strokeId: string) {
    const list = room.personalStrokes.get(participantId);
    if (!list) return;
    room.personalStrokes.set(
      participantId,
      list.filter((s) => s.id !== strokeId),
    );
    this.store.markBoardDirty(room, participantId);
  }

  clearPersonalStrokes(room: Room, participantId: string) {
    room.personalStrokes.set(participantId, []);
    this.store.markBoardDirty(room, participantId);
  }

  setMode(room: Room, mode: StageMode) {
    room.mode = mode;
  }

  setSlideIndex(room: Room, index: number) {
    room.slideIndex = Math.max(0, index);
  }

  setGridVisible(room: Room, visible: boolean) {
    room.gridVisible = visible;
  }

  addChatMessage(
    room: Room,
    authorId: string,
    authorName: string,
    text: string,
  ): ChatMessage {
    const message: ChatMessage = {
      id: generateId(),
      authorId,
      authorName,
      text: text.slice(0, 2000),
      ts: Date.now(),
    };
    room.chat.push(message);
    if (room.chat.length > MAX_CHAT_MESSAGES) {
      room.chat.splice(0, room.chat.length - MAX_CHAT_MESSAGES);
    }
    this.store.markDirty(room, 'chat');
    return message;
  }

  // A dropped connection doesn't cost anyone their seat straight away: they
  // keep their permissions and personal board for a grace period, and a
  // rejoin with the same participantId picks everything back up.
  markParticipantOffline(room: Room, participantId: string) {
    const participant = room.participants.get(participantId);
    if (!participant) return;
    participant.socketId = '';
    participant.camOn = false;
    participant.micOn = false;
    if (room.screenShare?.peerId === participantId) room.screenShare = null;
    this.store.markDirty(room, 'participants');
    this.scheduleOfflineRemoval(room, participantId);
  }

  removeParticipant(room: Room, participantId: string) {
    this.cancelOfflineTimer(room, participantId);
    room.participants.delete(participantId);
    room.personalStrokes.delete(participantId);
    if (room.screenShare?.peerId === participantId) room.screenShare = null;
    this.store.markDirty(room, 'participants');
    this.store.markBoardDirty(room, participantId);
  }

  isOnline(participant: Participant) {
    return participant.socketId !== '';
  }

  onlineCount(room: Room) {
    let count = 0;
    for (const p of room.participants.values()) if (this.isOnline(p)) count++;
    return count;
  }

  startScreenShare(room: Room, peerId: string, name: string) {
    room.screenShare = { peerId, name, startedAt: Date.now() };
    return room.screenShare;
  }

  // Only the current sharer can end the share (a late "stop" from someone who
  // already handed over mustn't clear the new sharer's state).
  stopScreenShare(room: Room, peerId: string) {
    if (room.screenShare?.peerId !== peerId) return false;
    room.screenShare = null;
    return true;
  }

  // Offline participants stay out of the roster everyone sees; they reappear
  // (via participant:joined) if they reconnect within the grace period.
  // Re-read from settings each time, so an admin change reaches sessions as
  // people (re)join without restarting them.
  toolsFor(room: Room): string[] {
    return allowedTools(this.settings.current().drawingTools, room.premiumTools);
  }

  isToolAllowed(room: Room, strokeTool: string) {
    const option = optionForStrokeTool(strokeTool);
    return !!option && this.toolsFor(room).includes(option);
  }

  toSnapshot(room: Room): RoomSnapshot {
    return {
      code: room.code,
      title: room.title,
      mode: room.mode,
      slideIndex: room.slideIndex,
      gridVisible: room.gridVisible,
      hostMedia: room.hostMedia,
      strokes: room.strokes,
      slides: room.slides,
      chat: room.chat,
      participants: Array.from(room.participants.values())
        .filter((p) => this.isOnline(p))
        .map(({ socketId: _socketId, ...rest }) => rest),
      screenShare: room.screenShare,
      tools: this.toolsFor(room),
    };
  }

  // Who's connected to live sessions right now, for the admin "online" view.
  // Rooms nobody is connected to are left out.
  liveSummary() {
    const sessions = [];
    for (const room of this.rooms.values()) {
      const participants = Array.from(room.participants.values())
        .filter((p) => this.isOnline(p))
        .map((p) => ({ id: p.id, name: p.name, onStage: p.onStage, joinedAt: p.joinedAt }));
      if (!room.hostSocketId && participants.length === 0) continue;
      sessions.push({
        code: room.code,
        title: room.title,
        ownerId: room.ownerId,
        hostOnline: !!room.hostSocketId,
        createdAt: room.createdAt,
        participants,
      });
    }
    return sessions;
  }

  private adopt(room: Room): Room {
    const existing = this.rooms.get(room.code);
    if (existing) return existing;
    this.rooms.set(room.code, room);
    for (const participant of room.participants.values()) {
      if (!this.isOnline(participant)) {
        this.scheduleOfflineRemoval(room, participant.id);
      }
    }
    return room;
  }

  private timerKey(room: Room, participantId: string) {
    return `${room.code}:${participantId}`;
  }

  private scheduleOfflineRemoval(room: Room, participantId: string) {
    this.cancelOfflineTimer(room, participantId);
    const key = this.timerKey(room, participantId);
    const timer = setTimeout(() => {
      this.offlineTimers.delete(key);
      const participant = room.participants.get(participantId);
      if (participant && !this.isOnline(participant)) {
        this.removeParticipant(room, participantId);
      }
    }, RECONNECT_GRACE_MS);
    timer.unref();
    this.offlineTimers.set(key, timer);
  }

  private cancelOfflineTimer(room: Room, participantId: string) {
    const key = this.timerKey(room, participantId);
    const timer = this.offlineTimers.get(key);
    if (timer) clearTimeout(timer);
    this.offlineTimers.delete(key);
  }

  private hasConnectedClients(room: Room) {
    return !!room.hostSocketId || this.onlineCount(room) > 0;
  }

  private async sweepIdleRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (now - room.lastActivityAt <= ROOM_IDLE_TTL_MS) continue;
      if (this.hasConnectedClients(room)) continue;
      await this.store.flush(code);
      this.rooms.delete(code);
      for (const id of room.participants.keys()) this.cancelOfflineTimer(room, id);
    }
    try {
      const purged = await this.store.purgeInactiveBefore(
        new Date(now - ROOM_RETENTION_MS),
      );
      if (purged) this.logger.log(`Deleted ${purged} expired room(s)`);
    } catch (err) {
      this.logger.error('Could not purge expired rooms', err);
    }
  }
}
