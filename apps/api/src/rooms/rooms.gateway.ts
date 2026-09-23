import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { customAlphabet } from 'nanoid';
import { RoomsService } from './rooms.service.js';
import { LiveKitService } from './livekit.service.js';
import type { Room, Slide, Stroke } from './room.types.js';
import { corsOriginCheck } from '../cors.js';
import { FONT_FAMILY_PATTERN, GOOGLE_FONT_PATTERN } from '../platform/drawing-tools.js';

const generateId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);

interface JoinPayload {
  code: string;
  role: 'host' | 'participant';
  name?: string;
  hostToken?: string;
  participantId?: string;
}

interface ClientMeta {
  code: string;
  role: 'host' | 'participant';
  participantId?: string;
}

const VALID_TOOLS = new Set([
  'pen',
  'highlighter',
  'signature',
  'eraser',
  'line',
  'rectangle',
  'ellipse',
  'text',
  'diamond',
  'triangle',
  'polygon',
  'star',
  'image',
  'sticky',
  'math',
]);

// Box-placed elements (images, sticky notes, equations) are anchored by two
// corner points, like shapes.
const BOX_TOOLS = new Set(['image', 'sticky', 'math']);

// Images and rendered equations travel inline as data URLs. Clients downscale
// and re-encode pictures before sending, so this is a backstop, not a target.
const MAX_IMAGE_SRC_CHARS = 1_500_000;
const IMAGE_SRC_PATTERN = /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/;

const VALID_DASHES = new Set(['solid', 'dashed', 'dotted']);

function isValidStroke(stroke: unknown): stroke is Stroke {
  if (!stroke || typeof stroke !== 'object') return false;
  const s = stroke as Partial<Stroke>;
  return (
    typeof s.id === 'string' &&
    typeof s.tool === 'string' &&
    VALID_TOOLS.has(s.tool) &&
    Array.isArray(s.points) &&
    s.points.length > 0 &&
    s.points.length < 5000 &&
    typeof s.color === 'string' &&
    typeof s.width === 'number' &&
    (s.text === undefined || (typeof s.text === 'string' && s.text.length <= 2000)) &&
    (s.dash === undefined || VALID_DASHES.has(s.dash)) &&
    (!BOX_TOOLS.has(s.tool) || s.points.length === 2) &&
    (s.src === undefined ||
      (typeof s.src === 'string' &&
        s.src.length <= MAX_IMAGE_SRC_CHARS &&
        IMAGE_SRC_PATTERN.test(s.src))) &&
    ((s.tool !== 'image' && s.tool !== 'math') || typeof s.src === 'string') &&
    (s.fontSize === undefined || (typeof s.fontSize === 'number' && s.fontSize >= 6 && s.fontSize <= 400)) &&
    (s.fontFamily === undefined || (typeof s.fontFamily === 'string' && FONT_FAMILY_PATTERN.test(s.fontFamily))) &&
    (s.fontGoogle === undefined || (typeof s.fontGoogle === 'string' && GOOGLE_FONT_PATTERN.test(s.fontGoogle))) &&
    (s.bold === undefined || typeof s.bold === 'boolean') &&
    (s.italic === undefined || typeof s.italic === 'boolean')
  );
}

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length < 100;
}

const MAX_LOADED_STROKES = 4000;
const MAX_SLIDES = 500;

function isValidStrokeList(strokes: unknown): strokes is Stroke[] {
  return Array.isArray(strokes) && strokes.length <= MAX_LOADED_STROKES && strokes.every(isValidStroke);
}

function isValidSlide(slide: unknown): slide is Slide {
  if (!slide || typeof slide !== 'object') return false;
  const s = slide as Partial<Slide>;
  return (
    typeof s.id === 'string' &&
    s.id.length < 100 &&
    typeof s.title === 'string' &&
    s.title.length < 300 &&
    typeof s.body === 'string' &&
    s.body.length < 10000
  );
}

function isValidSlideList(slides: unknown): slides is Slide[] {
  return Array.isArray(slides) && slides.length <= MAX_SLIDES && slides.every(isValidSlide);
}

@WebSocketGateway({
  cors: { origin: corsOriginCheck },
  // Room snapshots and board loads carry pasted images inline (see
  // MAX_IMAGE_SRC_CHARS); socket.io's 1 MB default would drop them.
  maxHttpBufferSize: 10_000_000,
})
export class RoomsGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly clients = new Map<string, ClientMeta>();

  constructor(
    private readonly rooms: RoomsService,
    private readonly liveKit: LiveKitService,
  ) {}

  private channel(code: string) {
    return `room:${code}`;
  }

  handleDisconnect(client: Socket) {
    const meta = this.clients.get(client.id);
    this.clients.delete(client.id);
    if (!meta) return;

    const room = this.rooms.getRoom(meta.code);
    if (!room) return;

    if (meta.role === 'host') {
      if (room.hostSocketId === client.id) room.hostSocketId = null;
      if (this.rooms.stopScreenShare(room, 'host')) {
        this.server.to(this.channel(meta.code)).emit('screenshare:stopped', { peerId: 'host' });
      }
      this.server.to(this.channel(meta.code)).emit('host:left');
      return;
    }

    if (meta.participantId) {
      const participant = room.participants.get(meta.participantId);
      // A stale disconnect from a socket the participant already replaced
      // (they rejoined from a new connection first) must not knock them out.
      if (participant && participant.socketId !== client.id) return;
      const wasSharing = room.screenShare?.peerId === meta.participantId;
      this.rooms.markParticipantOffline(room, meta.participantId);
      if (wasSharing) {
        this.server
          .to(this.channel(meta.code))
          .emit('screenshare:stopped', { peerId: meta.participantId });
      }
      this.server
        .to(this.channel(meta.code))
        .emit('participant:left', { participantId: meta.participantId });
    }
  }

  @SubscribeMessage('room:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinPayload,
  ) {
    const room = await this.rooms.loadRoom(payload.code ?? '');
    if (!room) return { ok: false as const, error: 'Room not found' };

    if (payload.role === 'host') {
      if (!payload.hostToken || payload.hostToken !== room.hostToken) {
        return { ok: false as const, error: 'Invalid host session' };
      }
      room.hostSocketId = client.id;
      room.hostMedia = { camOn: false, micOn: false };
      this.clients.set(client.id, { code: room.code, role: 'host' });
      client.join(this.channel(room.code));
      this.rooms.touch(room);
      const livekitToken = await this.liveKit.mintToken(room.code, 'host', 'Host', true);
      // A reconnecting host was only the sharer until their socket dropped;
      // clear any stale share so the badge doesn't stick.
      if (room.screenShare?.peerId === 'host') {
        room.screenShare = null;
        this.server.to(this.channel(room.code)).emit('screenshare:stopped', { peerId: 'host' });
      }
      return {
        ok: true as const,
        snapshot: this.rooms.toSnapshot(room),
        personalBoards: Object.fromEntries(room.personalStrokes),
        livekitToken,
      };
    }

    const participant = this.rooms.createOrResumeParticipant(
      room,
      client.id,
      payload.name ?? 'Guest',
      payload.participantId,
    );
    this.clients.set(client.id, {
      code: room.code,
      role: 'participant',
      participantId: participant.id,
    });
    client.join(this.channel(room.code));
    this.rooms.touch(room);

    client.to(this.channel(room.code)).emit('participant:joined', {
      participant,
    });

    const livekitToken = await this.liveKit.mintToken(
      room.code,
      participant.id,
      participant.name,
      participant.onStage,
      participant.canShareScreen,
    );

    return {
      ok: true as const,
      participantId: participant.id,
      snapshot: this.rooms.toSnapshot(room),
      personalStrokes: room.personalStrokes.get(participant.id) ?? [],
      livekitToken,
    };
  }

  @SubscribeMessage('stage:setMode')
  handleSetMode(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { mode: 'slides' | 'whiteboard' },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    this.rooms.setMode(room, body.mode);
    this.rooms.touch(room);
    this.server.to(this.channel(room.code)).emit('stage:mode', {
      mode: body.mode,
    });
  }

  @SubscribeMessage('stage:setSlide')
  handleSetSlide(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { index: number },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    this.rooms.setSlideIndex(room, body.index);
    this.rooms.touch(room);
    this.server
      .to(this.channel(room.code))
      .emit('stage:slide', { index: room.slideIndex });
  }

  @SubscribeMessage('stage:setGrid')
  handleSetGrid(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { visible: boolean },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    this.rooms.setGridVisible(room, !!body.visible);
    this.rooms.touch(room);
    this.server
      .to(this.channel(room.code))
      .emit('stage:grid', { visible: room.gridVisible });
  }

  @SubscribeMessage('stage:setSlides')
  handleSetSlides(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { slides: Slide[] },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room || !isValidSlideList(body?.slides)) return;
    this.rooms.setSlides(room, body.slides);
    this.rooms.touch(room);
    this.server
      .to(this.channel(room.code))
      .emit('stage:slides', { slides: room.slides });
  }

  @SubscribeMessage('whiteboard:stroke')
  handleWhiteboardStroke(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { stroke: Stroke },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room || !isValidStroke(body?.stroke) || !this.rooms.isToolAllowed(room, body.stroke.tool)) return;
    if (meta.role === 'participant') {
      const participant = room.participants.get(meta.participantId ?? '');
      if (!participant?.canDraw) return;
    }
    this.rooms.addStroke(room, body.stroke);
    this.rooms.touch(room);
    client
      .to(this.channel(room.code))
      .emit('whiteboard:stroke', { stroke: body.stroke });
  }

  @SubscribeMessage('whiteboard:update')
  handleWhiteboardUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { stroke: Stroke },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room || !isValidStroke(body?.stroke) || !this.rooms.isToolAllowed(room, body.stroke.tool)) return;
    if (meta.role === 'participant') {
      const participant = room.participants.get(meta.participantId ?? '');
      if (!participant?.canDraw) return;
    }
    this.rooms.updateStroke(room, body.stroke);
    this.rooms.touch(room);
    client
      .to(this.channel(room.code))
      .emit('whiteboard:update', { stroke: body.stroke });
  }

  @SubscribeMessage('whiteboard:undo')
  handleWhiteboardUndo(@ConnectedSocket() client: Socket) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    this.rooms.undoStroke(room);
    this.rooms.touch(room);
    this.server
      .to(this.channel(room.code))
      .emit('whiteboard:sync', { strokes: room.strokes });
  }

  @SubscribeMessage('whiteboard:delete')
  handleWhiteboardDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { strokeId: string },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room || !isValidId(body?.strokeId)) return;
    if (meta.role === 'participant') {
      const participant = room.participants.get(meta.participantId ?? '');
      if (!participant?.canDraw) return;
    }
    this.rooms.deleteStroke(room, body.strokeId);
    this.rooms.touch(room);
    client
      .to(this.channel(room.code))
      .emit('whiteboard:delete', { strokeId: body.strokeId });
  }

  // A stroke still being drawn, streamed so everyone watches it appear
  // instead of seeing it pop in when the pen lifts. Relayed only, never
  // stored: the finished stroke arrives as whiteboard:stroke / personal:stroke
  // with the same id and replaces the draft. Freehand drafts carry just the
  // points added since the previous chunk (`from` is where they start).
  @SubscribeMessage('draft:update')
  handleDraftUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { board: 'shared' | 'personal'; stroke: Stroke; from: number },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    const stroke = body?.stroke;
    if (!room || !stroke || typeof stroke !== 'object') return;
    if (!Number.isInteger(body.from) || body.from < 0 || body.from > 5000) return;
    if (!Array.isArray(stroke.points) || stroke.points.length > 1000) return;
    if (stroke.src !== undefined) return;
    if (!isValidStroke({ ...stroke, points: stroke.points.length ? stroke.points : [{ x: 0, y: 0 }] })) return;
    if (!this.rooms.isToolAllowed(room, stroke.tool)) return;
    const participant =
      meta.role === 'participant' ? room.participants.get(meta.participantId ?? '') : undefined;
    if (meta.role === 'participant' && !participant?.canDraw) return;

    if (body.board === 'shared') {
      client.to(this.channel(room.code)).emit('draft:update', {
        board: 'shared',
        stroke,
        from: body.from,
      });
      return;
    }
    if (participant && room.hostSocketId) {
      this.server.to(room.hostSocketId).emit('draft:update', {
        board: 'personal',
        participantId: participant.id,
        stroke,
        from: body.from,
      });
    }
  }

  @SubscribeMessage('whiteboard:clear')
  handleWhiteboardClear(@ConnectedSocket() client: Socket) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    this.rooms.clearStrokes(room);
    this.rooms.touch(room);
    this.server
      .to(this.channel(room.code))
      .emit('whiteboard:sync', { strokes: [] });
  }

  @SubscribeMessage('whiteboard:load')
  handleWhiteboardLoad(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { strokes: Stroke[] },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room || !isValidStrokeList(body?.strokes)) return;
    // Loading a saved board keeps only what this session's tools allow.
    body.strokes = body.strokes.filter((stroke) => this.rooms.isToolAllowed(room, stroke.tool));
    this.rooms.setStrokes(room, body.strokes);
    this.rooms.touch(room);
    this.server
      .to(this.channel(room.code))
      .emit('whiteboard:sync', { strokes: room.strokes });
  }

  @SubscribeMessage('personal:stroke')
  handlePersonalStroke(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { stroke: Stroke },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta || meta.role !== 'participant' || !meta.participantId) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room || !isValidStroke(body?.stroke) || !this.rooms.isToolAllowed(room, body.stroke.tool)) return;
    const participant = room.participants.get(meta.participantId);
    if (!participant?.canDraw) return;

    this.rooms.addPersonalStroke(room, meta.participantId, body.stroke);
    this.rooms.touch(room);
    if (room.hostSocketId) {
      this.server.to(room.hostSocketId).emit('personal:stroke', {
        participantId: meta.participantId,
        stroke: body.stroke,
      });
    }
  }

  @SubscribeMessage('personal:update')
  handlePersonalUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { stroke: Stroke },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta || meta.role !== 'participant' || !meta.participantId) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room || !isValidStroke(body?.stroke) || !this.rooms.isToolAllowed(room, body.stroke.tool)) return;
    const participant = room.participants.get(meta.participantId);
    if (!participant?.canDraw) return;

    this.rooms.updatePersonalStroke(room, meta.participantId, body.stroke);
    this.rooms.touch(room);
    if (room.hostSocketId) {
      this.server.to(room.hostSocketId).emit('personal:update', {
        participantId: meta.participantId,
        stroke: body.stroke,
      });
    }
  }

  @SubscribeMessage('personal:delete')
  handlePersonalDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { strokeId: string },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta || meta.role !== 'participant' || !meta.participantId) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room || !isValidId(body?.strokeId)) return;
    const participant = room.participants.get(meta.participantId);
    if (!participant?.canDraw) return;

    this.rooms.deletePersonalStroke(room, meta.participantId, body.strokeId);
    this.rooms.touch(room);
    if (room.hostSocketId) {
      this.server.to(room.hostSocketId).emit('personal:sync', {
        participantId: meta.participantId,
        strokes: room.personalStrokes.get(meta.participantId) ?? [],
      });
    }
  }

  @SubscribeMessage('personal:undo')
  handlePersonalUndo(@ConnectedSocket() client: Socket) {
    const meta = this.clients.get(client.id);
    if (!meta || meta.role !== 'participant' || !meta.participantId) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    this.rooms.undoPersonalStroke(room, meta.participantId);
    this.rooms.touch(room);
    if (room.hostSocketId) {
      this.server.to(room.hostSocketId).emit('personal:sync', {
        participantId: meta.participantId,
        strokes: room.personalStrokes.get(meta.participantId) ?? [],
      });
    }
  }

  @SubscribeMessage('personal:clear')
  handlePersonalClear(@ConnectedSocket() client: Socket) {
    const meta = this.clients.get(client.id);
    if (!meta || meta.role !== 'participant' || !meta.participantId) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    this.rooms.clearPersonalStrokes(room, meta.participantId);
    this.rooms.touch(room);
    if (room.hostSocketId) {
      this.server.to(room.hostSocketId).emit('personal:sync', {
        participantId: meta.participantId,
        strokes: [],
      });
    }
  }

  @SubscribeMessage('personal:hostClear')
  handleHostClearPersonal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { participantId: string },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    const participant = room?.participants.get(body?.participantId);
    if (!room || !participant) return;
    this.rooms.clearPersonalStrokes(room, participant.id);
    this.rooms.touch(room);
    const payload = { participantId: participant.id, strokes: [] as Stroke[] };
    client.emit('personal:sync', payload);
    this.server.to(participant.socketId).emit('personal:sync', payload);
  }

  @SubscribeMessage('personal:hostUndo')
  handleHostUndoPersonal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { participantId: string },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    const participant = room?.participants.get(body?.participantId);
    if (!room || !participant) return;
    this.rooms.undoPersonalStroke(room, participant.id);
    this.rooms.touch(room);
    const payload = {
      participantId: participant.id,
      strokes: room.personalStrokes.get(participant.id) ?? [],
    };
    client.emit('personal:sync', payload);
    this.server.to(participant.socketId).emit('personal:sync', payload);
  }

  @SubscribeMessage('personal:hostClearAll')
  handleHostClearAllPersonal(@ConnectedSocket() client: Socket) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    for (const participant of room.participants.values()) {
      this.rooms.clearPersonalStrokes(room, participant.id);
      const payload = { participantId: participant.id, strokes: [] as Stroke[] };
      client.emit('personal:sync', payload);
      this.server.to(participant.socketId).emit('personal:sync', payload);
    }
    this.rooms.touch(room);
  }

  @SubscribeMessage('cursor:move')
  handleCursorMove(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { board: 'shared' | 'personal'; x: number; y: number; targetParticipantId?: string },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    if (typeof body?.x !== 'number' || typeof body?.y !== 'number') return;

    if (body.board === 'shared') {
      const peerId = meta.role === 'host' ? 'host' : (meta.participantId ?? '');
      const name =
        meta.role === 'host'
          ? 'Host'
          : (room.participants.get(meta.participantId ?? '')?.name ?? 'Guest');
      client.to(this.channel(room.code)).emit('cursor:move', {
        board: 'shared',
        peerId,
        name,
        x: body.x,
        y: body.y,
      });
      return;
    }

    if (meta.role === 'participant' && meta.participantId) {
      if (!room.hostSocketId) return;
      const name = room.participants.get(meta.participantId)?.name ?? 'Guest';
      this.server.to(room.hostSocketId).emit('cursor:move', {
        board: 'personal',
        participantId: meta.participantId,
        peerId: meta.participantId,
        name,
        x: body.x,
        y: body.y,
      });
      return;
    }

    if (meta.role === 'host' && body.targetParticipantId) {
      const target = room.participants.get(body.targetParticipantId);
      if (!target) return;
      this.server.to(target.socketId).emit('cursor:move', {
        board: 'personal',
        participantId: body.targetParticipantId,
        peerId: 'host',
        name: 'Host',
        x: body.x,
        y: body.y,
      });
    }
  }

  @SubscribeMessage('cursor:leave')
  handleCursorLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { board: 'shared' | 'personal'; targetParticipantId?: string },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;

    if (body.board === 'shared') {
      const peerId = meta.role === 'host' ? 'host' : (meta.participantId ?? '');
      client.to(this.channel(room.code)).emit('cursor:leave', { board: 'shared', peerId });
      return;
    }

    if (meta.role === 'participant' && meta.participantId) {
      if (!room.hostSocketId) return;
      this.server.to(room.hostSocketId).emit('cursor:leave', {
        board: 'personal',
        participantId: meta.participantId,
        peerId: meta.participantId,
      });
      return;
    }

    if (meta.role === 'host' && body.targetParticipantId) {
      const target = room.participants.get(body.targetParticipantId);
      if (!target) return;
      this.server.to(target.socketId).emit('cursor:leave', {
        board: 'personal',
        participantId: body.targetParticipantId,
        peerId: 'host',
      });
    }
  }

  @SubscribeMessage('media:setState')
  handleMediaState(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { camOn: boolean; micOn: boolean },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    const camOn = !!body?.camOn;
    const micOn = !!body?.micOn;

    if (meta.role === 'host') {
      room.hostMedia = { camOn, micOn };
      this.server.to(this.channel(room.code)).emit('host:media', room.hostMedia);
    } else if (meta.participantId) {
      const participant = room.participants.get(meta.participantId);
      // Audience members have no publish grant in LiveKit, so their cam/mic
      // state can never actually go live; ignore the toggle rather than
      // showing a misleading "on" badge in the roster.
      if (!participant?.onStage) return;
      participant.camOn = camOn;
      participant.micOn = micOn;
      this.server
        .to(this.channel(room.code))
        .emit('participant:updated', { participant });
    }
    this.rooms.touch(room);
  }

  @SubscribeMessage('stage:invite')
  async handleStageInvite(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { participantId: string },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    const participant = room?.participants.get(body?.participantId);
    if (!room || !participant) return;

    participant.onStage = true;
    this.rooms.touch(room);
    await this.liveKit.setCanPublish(room.code, participant.id, true, participant.canShareScreen);
    this.server.to(this.channel(room.code)).emit('participant:updated', { participant });
  }

  @SubscribeMessage('stage:remove')
  async handleStageRemove(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { participantId: string },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    const participant = room?.participants.get(body?.participantId);
    if (!room || !participant) return;

    participant.onStage = false;
    participant.camOn = false;
    participant.micOn = false;
    this.rooms.touch(room);
    await this.liveKit.setCanPublish(room.code, participant.id, false, participant.canShareScreen);
    this.server.to(this.channel(room.code)).emit('participant:updated', { participant });
  }

  @SubscribeMessage('permission:setDraw')
  handleSetDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { participantId: string; canDraw: boolean },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    const participant = room?.participants.get(body.participantId);
    if (!room || !participant) return;
    participant.canDraw = body.canDraw;
    this.rooms.touch(room);
    this.server
      .to(this.channel(room.code))
      .emit('participant:updated', { participant });
  }

  @SubscribeMessage('permission:setAllDraw')
  handleSetAllDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { canDraw: boolean },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    for (const participant of room.participants.values()) {
      participant.canDraw = body.canDraw;
      this.server
        .to(this.channel(room.code))
        .emit('participant:updated', { participant });
    }
    this.rooms.touch(room);
  }

  @SubscribeMessage('hand:toggle')
  handleHandToggle(@ConnectedSocket() client: Socket) {
    const meta = this.clients.get(client.id);
    if (!meta || meta.role !== 'participant' || !meta.participantId) return;
    const room = this.rooms.getRoom(meta.code);
    const participant = room?.participants.get(meta.participantId);
    if (!room || !participant) return;
    participant.handRaised = !participant.handRaised;
    this.rooms.touch(room);
    this.server
      .to(this.channel(room.code))
      .emit('participant:updated', { participant });
  }

  @SubscribeMessage('chat:send')
  handleChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { text: string },
  ) {
    const meta = this.clients.get(client.id);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    const text = (body?.text ?? '').trim();
    if (!text) return;

    const authorId = meta.role === 'host' ? 'host' : (meta.participantId ?? generateId());
    const authorName =
      meta.role === 'host'
        ? 'Host'
        : (room.participants.get(meta.participantId ?? '')?.name ?? 'Guest');

    const message = this.rooms.addChatMessage(room, authorId, authorName, text);
    this.rooms.touch(room);
    this.server.to(this.channel(room.code)).emit('chat:message', { message });
  }

  // ---- Screen sharing ----
  //
  // The host can start at any time. A participant has to ask first: the
  // request goes to the host, and only an approval grants them the
  // screen-share source in LiveKit. Start/stop is announced over the socket
  // rather than inferred from the media track, so every other device can show
  // the "X is sharing their screen" modal straight away — including people
  // whose LiveKit subscription hasn't delivered the track yet.

  @SubscribeMessage('screenshare:start')
  handleScreenShareStart(@ConnectedSocket() client: Socket) {
    const meta = this.clients.get(client.id);
    if (!meta) return { ok: false as const, error: 'Not in this session' };
    const room = this.rooms.getRoom(meta.code);
    if (!room) return { ok: false as const, error: 'Session not found' };

    let peerId: string;
    let name: string;
    if (meta.role === 'host') {
      peerId = 'host';
      name = 'Host';
    } else {
      const participant = room.participants.get(meta.participantId ?? '');
      if (!participant) return { ok: false as const, error: 'Not in this session' };
      if (!participant.canShareScreen) {
        return { ok: false as const, error: 'Ask the host for permission to share your screen' };
      }
      peerId = participant.id;
      name = participant.name;
    }

    // One screen at a time: whoever starts replaces the previous sharer, and
    // that person is told to stop so two screens never publish at once.
    const previous = room.screenShare;
    if (previous && previous.peerId !== peerId) {
      const previousSocket = this.socketIdFor(room, previous.peerId);
      if (previousSocket) this.server.to(previousSocket).emit('screenshare:forceStop', { by: name });
    }

    const share = this.rooms.startScreenShare(room, peerId, name);
    this.rooms.touch(room);
    this.server.to(this.channel(room.code)).emit('screenshare:started', { share });
    return { ok: true as const };
  }

  @SubscribeMessage('screenshare:stop')
  handleScreenShareStop(@ConnectedSocket() client: Socket) {
    const meta = this.clients.get(client.id);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    if (!room) return;
    const peerId = meta.role === 'host' ? 'host' : (meta.participantId ?? '');
    if (!this.rooms.stopScreenShare(room, peerId)) return;
    this.rooms.touch(room);
    this.server.to(this.channel(room.code)).emit('screenshare:stopped', { peerId });
  }

  @SubscribeMessage('screenshare:request')
  handleScreenShareRequest(@ConnectedSocket() client: Socket) {
    const meta = this.clients.get(client.id);
    if (!meta || meta.role !== 'participant' || !meta.participantId) return;
    const room = this.rooms.getRoom(meta.code);
    const participant = room?.participants.get(meta.participantId);
    if (!room || !participant) return;
    if (!room.hostSocketId) return { ok: false as const, error: 'The host has left this session' };

    this.rooms.touch(room);
    this.server.to(room.hostSocketId).emit('screenshare:requested', {
      participantId: participant.id,
      name: participant.name,
    });
    return { ok: true as const };
  }

  @SubscribeMessage('screenshare:respond')
  async handleScreenShareRespond(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { participantId: string; approved: boolean },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    const participant = room?.participants.get(body?.participantId ?? '');
    if (!room || !participant) return;

    const approved = !!body.approved;
    participant.canShareScreen = approved;
    this.rooms.touch(room);
    await this.liveKit.setCanPublish(room.code, participant.id, participant.onStage, approved);
    this.server.to(participant.socketId).emit('screenshare:decision', { approved });
    this.server.to(this.channel(room.code)).emit('participant:updated', { participant });
  }

  // Revoking mid-share also ends the share for everyone.
  @SubscribeMessage('screenshare:setPermission')
  async handleScreenSharePermission(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { participantId: string; canShareScreen: boolean },
  ) {
    const meta = this.requireHost(client);
    if (!meta) return;
    const room = this.rooms.getRoom(meta.code);
    const participant = room?.participants.get(body?.participantId ?? '');
    if (!room || !participant) return;

    participant.canShareScreen = !!body.canShareScreen;
    this.rooms.touch(room);
    await this.liveKit.setCanPublish(
      room.code,
      participant.id,
      participant.onStage,
      participant.canShareScreen,
    );

    if (!participant.canShareScreen) {
      this.server.to(participant.socketId).emit('screenshare:forceStop', { by: 'Host' });
      if (this.rooms.stopScreenShare(room, participant.id)) {
        this.server
          .to(this.channel(room.code))
          .emit('screenshare:stopped', { peerId: participant.id });
      }
    }
    this.server.to(this.channel(room.code)).emit('participant:updated', { participant });
  }

  private socketIdFor(room: Room, peerId: string): string | undefined {
    if (peerId === 'host') return room.hostSocketId ?? undefined;
    return room.participants.get(peerId)?.socketId;
  }

  private requireHost(client: Socket): ClientMeta | undefined {
    const meta = this.clients.get(client.id);
    if (!meta || meta.role !== 'host') return undefined;
    return meta;
  }
}
