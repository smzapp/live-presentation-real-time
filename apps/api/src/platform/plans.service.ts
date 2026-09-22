import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from './settings.service.js';

export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

const INTERVALS = ['month', 'year'];

function parsePlanInput(input: Record<string, unknown>, partial: boolean) {
  const data: {
    name?: string;
    description?: string;
    priceCents?: number;
    interval?: string;
    maxBoards?: number | null;
    mediaLibrary?: boolean;
    mediaUpload?: boolean;
    maxMediaUploads?: number | null;
    isActive?: boolean;
  } = {};

  if (input.name !== undefined || !partial) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60) {
      throw new BadRequestException('Plan name is required (max 60 characters)');
    }
    data.name = input.name.trim();
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.length > 300) {
      throw new BadRequestException('Description must be text of at most 300 characters');
    }
    data.description = input.description.trim();
  }
  if (input.priceCents !== undefined) {
    if (!Number.isInteger(input.priceCents) || (input.priceCents as number) < 0) {
      throw new BadRequestException('Price must be a whole number of cents, 0 or more');
    }
    data.priceCents = input.priceCents as number;
  }
  if (input.interval !== undefined) {
    if (typeof input.interval !== 'string' || !INTERVALS.includes(input.interval)) {
      throw new BadRequestException('Interval must be "month" or "year"');
    }
    data.interval = input.interval;
  }
  if (input.maxBoards !== undefined) {
    if (input.maxBoards !== null && (!Number.isInteger(input.maxBoards) || (input.maxBoards as number) < 0)) {
      throw new BadRequestException('Board limit must be a whole number, or empty for unlimited');
    }
    data.maxBoards = input.maxBoards as number | null;
  }
  for (const key of ['mediaLibrary', 'mediaUpload'] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') throw new BadRequestException(`${key} must be a boolean`);
    data[key] = input[key] as boolean;
  }
  if (input.maxMediaUploads !== undefined) {
    if (
      input.maxMediaUploads !== null &&
      (!Number.isInteger(input.maxMediaUploads) || (input.maxMediaUploads as number) < 0)
    ) {
      throw new BadRequestException('Upload limit must be a whole number, or empty for unlimited');
    }
    data.maxMediaUploads = input.maxMediaUploads as number | null;
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') throw new BadRequestException('isActive must be a boolean');
    data.isActive = input.isActive;
  }
  return data;
}

@Injectable()
export class PlansService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // Starter plans so a fresh install has something to assign; only created
  // when no plans exist, so admin edits/deletions are never undone on boot.
  async onModuleInit() {
    if ((await this.prisma.plan.count()) > 0) return;
    const free = await this.prisma.plan.create({
      data: { name: 'Free', description: 'For trying things out.', priceCents: 0, maxBoards: 10, mediaUpload: false },
    });
    await this.prisma.plan.create({
      data: {
        name: 'Pro',
        description: 'Unlimited boards for regular presenters.',
        priceCents: 1200,
        maxBoards: null,
        mediaUpload: true,
        maxMediaUploads: null,
      },
    });
    const current = await this.settings.getAll();
    if (!current.defaultPlanId) await this.settings.update({ defaultPlanId: free.id });
  }

  async list() {
    const plans = await this.prisma.plan.findMany({
      orderBy: [{ priceCents: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { subscriptions: true } } },
    });
    return plans.map(({ _count, ...plan }) => ({ ...plan, subscriberCount: _count.subscriptions }));
  }

  async create(input: Record<string, unknown>) {
    const data = parsePlanInput(input, false);
    try {
      return await this.prisma.plan.create({ data: { ...data, name: data.name! } });
    } catch {
      throw new ConflictException('A plan with that name already exists');
    }
  }

  async update(id: string, input: Record<string, unknown>) {
    await this.findOrThrow(id);
    const data = parsePlanInput(input, true);
    if (data.isActive === false) {
      const { defaultPlanId } = await this.settings.getAll();
      if (defaultPlanId === id) {
        throw new ConflictException('This is the default plan for new users — choose another default first');
      }
    }
    try {
      return await this.prisma.plan.update({ where: { id }, data });
    } catch {
      throw new ConflictException('A plan with that name already exists');
    }
  }

  async remove(id: string) {
    await this.findOrThrow(id);
    const subscribers = await this.prisma.subscription.count({ where: { planId: id } });
    if (subscribers > 0) {
      throw new ConflictException(
        `${subscribers} user${subscribers === 1 ? ' is' : 's are'} on this plan — move them or deactivate the plan instead`,
      );
    }
    const { defaultPlanId } = await this.settings.getAll();
    if (defaultPlanId === id) {
      throw new ConflictException('This is the default plan for new users — choose another default first');
    }
    await this.prisma.plan.delete({ where: { id } });
    return { ok: true };
  }

  async assign(userId: string, input: { planId?: unknown; status?: unknown }) {
    if (input.planId === null) {
      await this.prisma.subscription.deleteMany({ where: { userId } });
      return null;
    }
    if (typeof input.planId !== 'string') throw new BadRequestException('planId is required');
    await this.findOrThrow(input.planId);
    const status = (input.status ?? 'active') as SubscriptionStatus;
    if (!SUBSCRIPTION_STATUSES.includes(status)) throw new BadRequestException('Invalid subscription status');

    const existing = await this.prisma.subscription.findUnique({ where: { userId } });
    const canceledAt = status === 'canceled' ? (existing?.canceledAt ?? new Date()) : null;
    const planChanged = existing?.planId !== input.planId;
    return this.prisma.subscription.upsert({
      where: { userId },
      update: { planId: input.planId, status, canceledAt, ...(planChanged ? { startedAt: new Date() } : {}) },
      create: { userId, planId: input.planId, status, canceledAt },
      include: { plan: true },
    });
  }

  async assignDefault(userId: string) {
    const { defaultPlanId } = await this.settings.getAll();
    if (!defaultPlanId) return;
    const plan = await this.prisma.plan.findUnique({ where: { id: defaultPlanId } });
    if (!plan || !plan.isActive) return;
    await this.prisma.subscription.create({ data: { userId, planId: plan.id } });
  }

  async forUser(userId: string) {
    return this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
  }

  // A canceled subscription (or none) imposes no limit here — plans only cap
  // usage while they're in effect.
  async assertCanCreateBoard(userId: string) {
    const sub = await this.forUser(userId);
    if (!sub || sub.status === 'canceled' || sub.plan.maxBoards === null) return;
    const count = await this.prisma.board.count({ where: { ownerId: userId } });
    if (count >= sub.plan.maxBoards) {
      throw new ForbiddenException(
        `Your ${sub.plan.name} plan allows ${sub.plan.maxBoards} board${sub.plan.maxBoards === 1 ? '' : 's'}. Delete a board or upgrade your plan.`,
      );
    }
  }

  private async findOrThrow(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }
}
