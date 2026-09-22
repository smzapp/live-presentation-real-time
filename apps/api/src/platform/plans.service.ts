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
export const BILLING_TYPES = ['subscription', 'payg'] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

// A subscription only grants anything while it's in one of these states.
export const LIVE_STATUSES: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

// The plans a fresh install starts with — and, once, what an existing install
// is topped up to (see ensureCatalog). Admins can edit or remove any of them.
const CATALOG = [
  {
    name: 'Free',
    description: 'For trying things out.',
    priceCents: 0,
    billingType: 'subscription',
    maxBoards: 10,
    mediaLibrary: true,
    mediaUpload: false,
    maxMediaUploads: null,
    premiumTools: false,
    highlight: false,
  },
  {
    name: 'Plus',
    description: 'For regular presenters who want every tool.',
    priceCents: 600,
    billingType: 'subscription',
    maxBoards: 50,
    mediaLibrary: true,
    mediaUpload: true,
    maxMediaUploads: 50,
    premiumTools: true,
    highlight: false,
  },
  {
    name: 'Pro',
    description: 'Unlimited boards and uploads for power users and teams.',
    priceCents: 1200,
    billingType: 'subscription',
    maxBoards: null,
    mediaLibrary: true,
    mediaUpload: true,
    maxMediaUploads: null,
    premiumTools: true,
    highlight: true,
  },
  {
    name: 'Pay as you go',
    description: 'No monthly fee — pay only for the live sessions you host.',
    priceCents: 0,
    billingType: 'payg',
    unitPriceCents: 50,
    maxBoards: 25,
    mediaLibrary: true,
    mediaUpload: true,
    maxMediaUploads: 25,
    premiumTools: true,
    highlight: false,
  },
] as const;

const CATALOG_VERSION_KEY = 'planCatalogVersion';
const CATALOG_VERSION = 2;

export const planPublicSelect = {
  id: true,
  name: true,
  description: true,
  priceCents: true,
  interval: true,
  billingType: true,
  unitPriceCents: true,
  maxBoards: true,
  mediaLibrary: true,
  mediaUpload: true,
  maxMediaUploads: true,
  premiumTools: true,
  highlight: true,
} as const;

function parsePlanInput(input: Record<string, unknown>, partial: boolean) {
  const data: {
    name?: string;
    description?: string;
    priceCents?: number;
    interval?: string;
    maxBoards?: number | null;
    billingType?: string;
    unitPriceCents?: number;
    premiumTools?: boolean;
    highlight?: boolean;
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
  if (input.billingType !== undefined) {
    if (!BILLING_TYPES.includes(input.billingType as BillingType)) {
      throw new BadRequestException('Billing type must be "subscription" or "payg"');
    }
    data.billingType = input.billingType as BillingType;
  }
  if (input.unitPriceCents !== undefined) {
    if (!Number.isInteger(input.unitPriceCents) || (input.unitPriceCents as number) < 0) {
      throw new BadRequestException('Price per session must be a whole number of cents, 0 or more');
    }
    data.unitPriceCents = input.unitPriceCents as number;
  }
  for (const key of ['mediaLibrary', 'mediaUpload', 'premiumTools', 'highlight'] as const) {
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

  async onModuleInit() {
    await this.ensureCatalog();
  }

  // Runs once per catalog version. A fresh install gets the whole catalog;
  // an existing one gets any plan it's missing (by name), and plans it
  // already has only gain the fields this version introduced — prices,
  // limits and anything an admin changed stay as they are.
  private async ensureCatalog() {
    const marker = await this.prisma.appSetting.findUnique({ where: { key: CATALOG_VERSION_KEY } });
    if (marker && Number(marker.value) >= CATALOG_VERSION) return;

    for (const entry of CATALOG) {
      const existing = await this.prisma.plan.findUnique({ where: { name: entry.name } });
      if (!existing) {
        await this.prisma.plan.create({ data: { ...entry } });
        continue;
      }
      await this.prisma.plan.update({
        where: { id: existing.id },
        data: {
          premiumTools: entry.premiumTools,
          highlight: entry.highlight,
          ...(entry.mediaUpload && !existing.mediaUpload
            ? { mediaUpload: true, maxMediaUploads: entry.maxMediaUploads }
            : {}),
        },
      });
    }

    const current = await this.settings.getAll();
    if (!current.defaultPlanId) {
      const free = await this.prisma.plan.findUnique({ where: { name: 'Free' } });
      if (free?.isActive) await this.settings.update({ defaultPlanId: free.id });
    }
    await this.prisma.appSetting.upsert({
      where: { key: CATALOG_VERSION_KEY },
      update: { value: String(CATALOG_VERSION) },
      create: { key: CATALOG_VERSION_KEY, value: String(CATALOG_VERSION) },
    });
  }

  // What the subscribe page offers: active plans, subscriptions by price,
  // pay-as-you-go last.
  async listPublic() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      select: planPublicSelect,
      orderBy: [{ priceCents: 'asc' }, { createdAt: 'asc' }],
    });
    return [...plans.filter((p) => p.billingType !== 'payg'), ...plans.filter((p) => p.billingType === 'payg')];
  }

  // The plan currently in force for a user, or null when they have none (or
  // it was canceled).
  async activePlan(userId: string) {
    const sub = await this.forUser(userId);
    if (!sub || !LIVE_STATUSES.includes(sub.status as SubscriptionStatus)) return null;
    return sub.plan;
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
    if (!sub || !LIVE_STATUSES.includes(sub.status as SubscriptionStatus) || sub.plan.maxBoards === null) return;
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
