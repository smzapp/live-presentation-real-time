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
import type { Slide, Stroke } from './room.types.js';
import { corsOriginCheck } from '../cors.js';

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
  'eraser',
  'line',
  'rectangle',
  'ellipse',
  'text',
]);

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
    (s.text === undefined || (typeof s.text === 'string' && s.text.length < 500))
  );
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
      this.server.to(this.channel(meta.code)).emit('host:left');
      return;
    }

    if (meta.participantId) {
      this.rooms.removeParticipant(room, meta.participantId);
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
    const room = this.rooms.getRoom(payload.code ?? '');
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
    if (!room || !isValidStroke(body?.stroke)) return;
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
    if (!room || !isValidStroke(body?.stroke)) return;
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
    if (!room || !isValidStroke(body?.stroke)) return;
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
    if (!room || !isValidStroke(body?.stroke)) return;
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
    await this.liveKit.setCanPublish(room.code, participant.id, true);
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
    await this.liveKit.setCanPublish(room.code, participant.id, false);
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

  private requireHost(client: Socket): ClientMeta | undefined {
    const meta = this.clients.get(client.id);
    if (!meta || meta.role !== 'host') return undefined;
    return meta;
  }
}
