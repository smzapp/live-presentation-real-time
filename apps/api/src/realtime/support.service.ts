import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { isStaff, type AuthenticatedUser } from '../auth/auth.types.js';

export const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_LIMIT = 200;

// Who is writing: a signed-in customer, a guest (by visitor id), or staff.
export type Customer = { user: AuthenticatedUser } | { guestKey: string; name?: string; email?: string };

const conversationSelect = {
  id: true,
  userId: true,
  guestKey: true,
  customerName: true,
  customerEmail: true,
  status: true,
  assigneeId: true,
  assignee: { select: { id: true, name: true } },
  unreadForStaff: true,
  unreadForCustomer: true,
  lastMessageAt: true,
  createdAt: true,
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { body: true, senderType: true, createdAt: true },
  },
} satisfies Prisma.SupportConversationSelect;

export type ConversationSummary = Prisma.SupportConversationGetPayload<{ select: typeof conversationSelect }>;

const messageSelect = {
  id: true,
  conversationId: true,
  senderType: true,
  senderName: true,
  body: true,
  createdAt: true,
} satisfies Prisma.SupportMessageSelect;

function cleanBody(body: unknown) {
  if (typeof body !== 'string') throw new BadRequestException('Write a message first');
  const text = body.trim();
  if (!text) throw new BadRequestException('Write a message first');
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequestException(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters`);
  }
  return text;
}

function cleanName(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  private customerWhere(customer: Customer): Prisma.SupportConversationWhereInput {
    return 'user' in customer ? { userId: customer.user.id } : { guestKey: customer.guestKey };
  }

  // ---- Customer side ----

  async findForCustomer(customer: Customer) {
    const conversation = await this.prisma.supportConversation.findFirst({
      where: this.customerWhere(customer),
      orderBy: { lastMessageAt: 'desc' },
      select: conversationSelect,
    });
    if (!conversation) return { conversation: null, messages: [] };
    return { conversation, messages: await this.history(conversation.id) };
  }

  async sendAsCustomer(customer: Customer, body: unknown) {
    const text = cleanBody(body);
    const existing = await this.prisma.supportConversation.findFirst({
      where: this.customerWhere(customer),
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, status: true },
    });

    const name =
      'user' in customer ? customer.user.name : cleanName(customer.name, 80) || 'Guest';
    const email = 'user' in customer ? customer.user.email : cleanName(customer.email, 254) || null;

    const conversationId =
      existing?.id ??
      (
        await this.prisma.supportConversation.create({
          data: {
            ...('user' in customer ? { userId: customer.user.id } : { guestKey: customer.guestKey }),
            customerName: name,
            customerEmail: email,
          },
          select: { id: true },
        })
      ).id;

    const [message] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: {
          conversationId,
          senderType: 'customer',
          senderId: 'user' in customer ? customer.user.id : null,
          senderName: name,
          body: text,
        },
        select: messageSelect,
      }),
      this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: {
          // Writing again reopens a closed conversation.
          status: 'open',
          lastMessageAt: new Date(),
          unreadForStaff: { increment: 1 },
          ...('user' in customer ? {} : { customerName: name, ...(email ? { customerEmail: email } : {}) }),
        },
      }),
    ]);
    return { message, conversation: await this.summary(conversationId) };
  }

  async markReadByCustomer(customer: Customer) {
    await this.prisma.supportConversation.updateMany({
      where: this.customerWhere(customer),
      data: { unreadForCustomer: 0 },
    });
  }

  // ---- Staff side ----

  // Super admins see every conversation; support agents only the ones
  // assigned to them.
  private staffWhere(staff: AuthenticatedUser): Prisma.SupportConversationWhereInput {
    return staff.role === 'superadmin' ? {} : { assigneeId: staff.id };
  }

  async assertStaffCanSee(staff: AuthenticatedUser, conversationId: string) {
    if (!isStaff(staff.role)) throw new ForbiddenException('Support staff only');
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { id: conversationId, ...this.staffWhere(staff) },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
  }

  async listForStaff(staff: AuthenticatedUser) {
    if (!isStaff(staff.role)) throw new ForbiddenException('Support staff only');
    return this.prisma.supportConversation.findMany({
      where: this.staffWhere(staff),
      orderBy: [{ status: 'desc' }, { lastMessageAt: 'desc' }],
      take: 300,
      select: conversationSelect,
    });
  }

  async unreadForStaff(staff: AuthenticatedUser) {
    if (!isStaff(staff.role)) return 0;
    const result = await this.prisma.supportConversation.aggregate({
      where: { ...this.staffWhere(staff), status: 'open' },
      _sum: { unreadForStaff: true },
    });
    return result._sum.unreadForStaff ?? 0;
  }

  async openForStaff(staff: AuthenticatedUser, conversationId: string) {
    await this.assertStaffCanSee(staff, conversationId);
    await this.prisma.supportConversation.update({ where: { id: conversationId }, data: { unreadForStaff: 0 } });
    return { conversation: await this.summary(conversationId), messages: await this.history(conversationId) };
  }

  async replyAsStaff(staff: AuthenticatedUser, conversationId: string, body: unknown) {
    await this.assertStaffCanSee(staff, conversationId);
    const text = cleanBody(body);
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
      select: { assigneeId: true },
    });
    const [message] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: { conversationId, senderType: 'staff', senderId: staff.id, senderName: staff.name, body: text },
        select: messageSelect,
      }),
      this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: {
          status: 'open',
          lastMessageAt: new Date(),
          unreadForStaff: 0,
          unreadForCustomer: { increment: 1 },
          // Whoever answers an unassigned chat picks it up.
          ...(conversation?.assigneeId ? {} : { assigneeId: staff.id }),
        },
      }),
    ]);
    return { message, conversation: await this.summary(conversationId) };
  }

  // Delegation is a super admin decision.
  async assign(staff: AuthenticatedUser, conversationId: string, assigneeId: unknown) {
    if (staff.role !== 'superadmin') throw new ForbiddenException('Only super admins can assign conversations');
    await this.assertStaffCanSee(staff, conversationId);
    const before = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
      select: { assigneeId: true },
    });
    let assignee: { id: string; name: string } | null = null;
    if (assigneeId !== null) {
      if (typeof assigneeId !== 'string') throw new BadRequestException('Choose someone to assign');
      assignee = await this.prisma.user.findFirst({
        where: { id: assigneeId, role: { in: ['superadmin', 'support'] }, status: 'active' },
        select: { id: true, name: true },
      });
      if (!assignee) throw new BadRequestException('Conversations can only go to active super admins or support agents');
    }
    const note = assignee ? `${staff.name} assigned this to ${assignee.name}` : `${staff.name} unassigned this conversation`;
    const [message] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: { conversationId, senderType: 'system', senderId: staff.id, senderName: staff.name, body: note },
        select: messageSelect,
      }),
      this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: { assigneeId: assignee?.id ?? null },
      }),
    ]);
    return { message, conversation: await this.summary(conversationId), previousAssigneeId: before?.assigneeId ?? null };
  }

  async setStatus(staff: AuthenticatedUser, conversationId: string, status: unknown) {
    await this.assertStaffCanSee(staff, conversationId);
    if (status !== 'open' && status !== 'closed') throw new BadRequestException('Status must be open or closed');
    const [message] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: {
          conversationId,
          senderType: 'system',
          senderId: staff.id,
          senderName: staff.name,
          body: status === 'closed' ? `${staff.name} closed this conversation` : `${staff.name} reopened this conversation`,
        },
        select: messageSelect,
      }),
      this.prisma.supportConversation.update({ where: { id: conversationId }, data: { status } }),
    ]);
    return { message, conversation: await this.summary(conversationId) };
  }

  async staffMembers() {
    return this.prisma.user.findMany({
      where: { role: { in: ['superadmin', 'support'] }, status: 'active' },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  // ---- Shared ----

  private history(conversationId: string) {
    return this.prisma.supportMessage
      .findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
        select: messageSelect,
      })
      .then((messages) => messages.reverse());
  }

  private summary(conversationId: string) {
    return this.prisma.supportConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: conversationSelect,
    });
  }
}
