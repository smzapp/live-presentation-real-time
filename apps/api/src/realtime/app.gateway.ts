import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { HttpException } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service.js';
import { isStaff, type AuthenticatedUser } from '../auth/auth.types.js';
import { corsOriginCheck } from '../cors.js';
import { PresenceService, type PresenceClient } from './presence.service.js';
import { SupportService, type ConversationSummary, type Customer } from './support.service.js';

// The visitor id is a random value each browser keeps; for guests it's also
// what their support chat is tied to, so it's treated like a secret.
const VISITOR_ID = /^[A-Za-z0-9-]{16,64}$/;

function cleanPath(path: unknown) {
  return typeof path === 'string' && path.startsWith('/') ? path.slice(0, 200) : '/';
}

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

async function respond<T>(work: () => Promise<T>): Promise<Ack<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (err) {
    const message =
      err instanceof HttpException ? String((err.getResponse() as { message?: unknown }).message ?? err.message) : 'Something went wrong';
    return { ok: false, error: message };
  }
}

// App-wide realtime channel (every page connects): who's online, and support
// chat between customers and staff. Separate from the live-session gateway on
// the default namespace.
@WebSocketGateway({ namespace: '/app', cors: { origin: corsOriginCheck } })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Namespace;

  // Token checks are async; handlers wait for the connection to be identified.
  private readonly ready = new Map<string, Promise<void>>();

  constructor(
    private readonly auth: AuthService,
    private readonly presence: PresenceService,
    private readonly support: SupportService,
  ) {}

  handleConnection(client: Socket) {
    const identify = (async () => {
      const auth = (client.handshake.auth ?? {}) as Record<string, unknown>;
      const token = typeof auth.token === 'string' ? auth.token : null;
      const visitorId =
        typeof auth.visitorId === 'string' && VISITOR_ID.test(auth.visitorId) ? auth.visitorId : `anon-${client.id}`;
      const user = token ? await this.auth.verifyToken(token) : null;
      const now = Date.now();
      this.presence.add({
        socketId: client.id,
        visitorId,
        user,
        path: cleanPath(auth.path),
        connectedAt: now,
        lastSeenAt: now,
      });
      await client.join(this.customerRoom(user, visitorId));
      if (user?.role === 'superadmin') await client.join('superadmins');
      if (user && isStaff(user.role)) {
        await client.join(`staff:${user.id}`);
        client.emit('support:badge', { unread: await this.support.unreadForStaff(user) });
      }
    })().catch(() => undefined);
    this.ready.set(client.id, identify);
  }

  handleDisconnect(client: Socket) {
    this.ready.delete(client.id);
    this.presence.remove(client.id);
  }

  private customerRoom(user: AuthenticatedUser | null, visitorId: string) {
    return user ? `user:${user.id}` : `guest:${visitorId}`;
  }

  private customerRoomFor(conversation: ConversationSummary) {
    return conversation.userId ? `user:${conversation.userId}` : `guest:${conversation.guestKey}`;
  }

  private async meta(client: Socket): Promise<PresenceClient> {
    await this.ready.get(client.id);
    const meta = this.presence.get(client.id);
    if (!meta) throw new HttpException({ message: 'Not connected' }, 400);
    return meta;
  }

  private customer(meta: PresenceClient, body?: { name?: unknown; email?: unknown }): Customer {
    if (meta.user) return { user: meta.user };
    if (meta.visitorId.startsWith('anon-')) {
      throw new HttpException({ message: 'Refresh the page to start a chat' }, 400);
    }
    return {
      guestKey: meta.visitorId,
      name: typeof body?.name === 'string' ? body.name : undefined,
      email: typeof body?.email === 'string' ? body.email : undefined,
    };
  }

  private async staff(client: Socket) {
    const meta = await this.meta(client);
    if (!meta.user || !isStaff(meta.user.role)) throw new HttpException({ message: 'Support staff only' }, 403);
    return meta.user;
  }

  // Everyone who should see a conversation change: all super admins, plus the
  // assignee if they're a support agent. Unread badges are refreshed for them.
  private async notifyStaff(conversation: ConversationSummary, message?: unknown, previousAssigneeId?: string | null) {
    let target = this.server.to('superadmins');
    if (conversation.assigneeId) target = target.to(`staff:${conversation.assigneeId}`);
    target.emit('support:update', { conversation, message });
    if (previousAssigneeId && previousAssigneeId !== conversation.assigneeId) {
      this.server.to(`staff:${previousAssigneeId}`).emit('support:removed', { id: conversation.id });
    }
    await this.refreshBadges([conversation.assigneeId, previousAssigneeId]);
  }

  private async refreshBadges(userIds: (string | null | undefined)[]) {
    const recipients = new Map<string, AuthenticatedUser>();
    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      const user = this.presence.get(socket.id)?.user;
      if (!user || !isStaff(user.role)) continue;
      if (user.role === 'superadmin' || userIds.includes(user.id)) recipients.set(user.id, user);
    }
    for (const user of recipients.values()) {
      this.server.to(`staff:${user.id}`).emit('support:badge', { unread: await this.support.unreadForStaff(user) });
    }
  }

  // ---- Presence ----

  @SubscribeMessage('presence:path')
  async handlePath(@ConnectedSocket() client: Socket, @MessageBody() body: { path?: unknown }) {
    await this.ready.get(client.id);
    this.presence.update(client.id, { path: cleanPath(body?.path) });
  }

  // ---- Support: customer side ----

  @SubscribeMessage('support:open')
  handleCustomerOpen(@ConnectedSocket() client: Socket) {
    return respond(async () => this.support.findForCustomer(this.customer(await this.meta(client))));
  }

  @SubscribeMessage('support:send')
  handleCustomerSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { body?: unknown; name?: unknown; email?: unknown },
  ) {
    return respond(async () => {
      const meta = await this.meta(client);
      const result = await this.support.sendAsCustomer(this.customer(meta, body), body?.body);
      // Every tab this customer has open sees it.
      this.server.to(this.customerRoom(meta.user, meta.visitorId)).emit('support:message', result);
      await this.notifyStaff(result.conversation, result.message);
      return result;
    });
  }

  @SubscribeMessage('support:read')
  handleCustomerRead(@ConnectedSocket() client: Socket) {
    return respond(async () => {
      await this.support.markReadByCustomer(this.customer(await this.meta(client)));
      return true;
    });
  }

  // ---- Support: staff side ----

  @SubscribeMessage('support:list')
  handleStaffList(@ConnectedSocket() client: Socket) {
    return respond(async () => {
      const staff = await this.staff(client);
      const [conversations, members] = await Promise.all([
        this.support.listForStaff(staff),
        staff.role === 'superadmin' ? this.support.staffMembers() : Promise.resolve([]),
      ]);
      return { conversations, staff: members };
    });
  }

  @SubscribeMessage('support:view')
  handleStaffView(@ConnectedSocket() client: Socket, @MessageBody() body: { id?: unknown }) {
    return respond(async () => {
      const staff = await this.staff(client);
      const result = await this.support.openForStaff(staff, String(body?.id ?? ''));
      await this.refreshBadges([staff.id]);
      return result;
    });
  }

  @SubscribeMessage('support:reply')
  handleStaffReply(@ConnectedSocket() client: Socket, @MessageBody() body: { id?: unknown; body?: unknown }) {
    return respond(async () => {
      const staff = await this.staff(client);
      const result = await this.support.replyAsStaff(staff, String(body?.id ?? ''), body?.body);
      this.server.to(this.customerRoomFor(result.conversation)).emit('support:message', result);
      await this.notifyStaff(result.conversation, result.message);
      return result;
    });
  }

  @SubscribeMessage('support:assign')
  handleStaffAssign(@ConnectedSocket() client: Socket, @MessageBody() body: { id?: unknown; assigneeId?: unknown }) {
    return respond(async () => {
      const staff = await this.staff(client);
      const result = await this.support.assign(staff, String(body?.id ?? ''), body?.assigneeId ?? null);
      this.server.to(this.customerRoomFor(result.conversation)).emit('support:message', result);
      await this.notifyStaff(result.conversation, result.message, result.previousAssigneeId);
      return result;
    });
  }

  @SubscribeMessage('support:status')
  handleStaffStatus(@ConnectedSocket() client: Socket, @MessageBody() body: { id?: unknown; status?: unknown }) {
    return respond(async () => {
      const staff = await this.staff(client);
      const result = await this.support.setStatus(staff, String(body?.id ?? ''), body?.status);
      this.server.to(this.customerRoomFor(result.conversation)).emit('support:message', result);
      await this.notifyStaff(result.conversation, result.message);
      return result;
    });
  }
}
