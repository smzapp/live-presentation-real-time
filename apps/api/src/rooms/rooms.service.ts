import { Injectable } from '@nestjs/common';
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

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateCode = customAlphabet(CODE_ALPHABET, 6);
const generateId = customAlphabet(
  'abcdefghijklmnopqrstuvwxyz0123456789',
  16,
);

const MAX_SHARED_STROKES = 4000;
const MAX_PERSONAL_STROKES = 1500;
const MAX_CHAT_MESSAGES = 500;
const ROOM_IDLE_TTL_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class RoomsService {
  private readonly rooms = new Map<string, Room>();

  constructor() {
    setInterval(() => this.sweepIdleRooms(), 15 * 60 * 1000).unref();
  }

  createRoom(title: string): Room {
    let code = generateCode();
    while (this.rooms.has(code)) code = generateCode();

    const room: Room = {
      code,
      title: title.trim() || 'Untitled session',
      hostToken: generateId(),
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
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  touch(room: Room) {
    room.lastActivityAt = Date.now();
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
  }

  undoStroke(room: Room) {
    room.strokes.pop();
  }

  updateStroke(room: Room, stroke: Stroke) {
    const index = room.strokes.findIndex((s) => s.id === stroke.id);
    if (index !== -1) room.strokes[index] = stroke;
  }

  clearStrokes(room: Room) {
    room.strokes = [];
  }

  setStrokes(room: Room, strokes: Stroke[]) {
    room.strokes =
      strokes.length > MAX_SHARED_STROKES
        ? strokes.slice(strokes.length - MAX_SHARED_STROKES)
        : strokes;
  }

  setSlides(room: Room, slides: Slide[]) {
    room.slides = slides;
  }

  addPersonalStroke(room: Room, participantId: string, stroke: Stroke) {
    const list = room.personalStrokes.get(participantId) ?? [];
    list.push(stroke);
    if (list.length > MAX_PERSONAL_STROKES) {
      list.splice(0, list.length - MAX_PERSONAL_STROKES);
    }
    room.personalStrokes.set(participantId, list);
  }

  undoPersonalStroke(room: Room, participantId: string) {
    const list = room.personalStrokes.get(participantId);
    list?.pop();
  }

  updatePersonalStroke(room: Room, participantId: string, stroke: Stroke) {
    const list = room.personalStrokes.get(participantId);
    if (!list) return;
    const index = list.findIndex((s) => s.id === stroke.id);
    if (index !== -1) list[index] = stroke;
  }

  clearPersonalStrokes(room: Room, participantId: string) {
    room.personalStrokes.set(participantId, []);
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
    return message;
  }

  removeParticipant(room: Room, participantId: string) {
    room.participants.delete(participantId);
    room.personalStrokes.delete(participantId);
    if (room.screenShare?.peerId === participantId) room.screenShare = null;
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
      participants: Array.from(room.participants.values()).map(
        ({ socketId: _socketId, ...rest }) => rest,
      ),
      screenShare: room.screenShare,
    };
  }

  private sweepIdleRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (now - room.lastActivityAt > ROOM_IDLE_TTL_MS) {
        this.rooms.delete(code);
      }
    }
  }
}
