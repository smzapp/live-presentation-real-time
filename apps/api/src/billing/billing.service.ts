import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlansService, planPublicSelect } from '../platform/plans.service.js';
import { SettingsService } from '../platform/settings.service.js';
import { allowedTools, lockedTools, type DrawingTool, type TextFont } from '../platform/drawing-tools.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

// No payment provider is connected yet, so plan changes apply immediately
// and nothing is charged. When one is (e.g. Stripe Checkout), subscribe()
// should hand off to it and activate the plan from its webhook instead.
const PAYMENTS_ENABLED = false;

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface Entitlements {
  premiumTools: boolean;
  tools: DrawingTool[];
  // Paid-plan tools this viewer can't use yet (shown locked, not hidden).
  lockedTools: DrawingTool[];
  fonts: TextFont[];
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
  ) {}

  listPlans() {
    return this.plans.listPublic();
  }

  // Super admins always have every paid tool; everyone else gets them while
  // a plan with premiumTools is in force. Signed-out viewers get none.
  async entitlements(user: AuthenticatedUser | null): Promise<Entitlements> {
    let premium = false;
    if (user?.role === 'superadmin') premium = true;
    else if (user) premium = !!(await this.plans.activePlan(user.id))?.premiumTools;
    const { drawingTools, textFonts } = this.settings.current();
    return {
      premiumTools: premium,
      tools: allowedTools(drawingTools, premium),
      lockedTools: lockedTools(drawingTools, premium),
      fonts: textFonts,
    };
  }

  async usageSummary(userId: string, since = monthStart()) {
    const records = await this.prisma.usageRecord.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
    const amountCents = records.reduce((sum, r) => sum + r.quantity * r.unitPriceCents, 0);
    const sessions = records.filter((r) => r.kind === 'session').reduce((sum, r) => sum + r.quantity, 0);
    return {
      periodStart: since.toISOString(),
      sessions,
      amountCents,
      recent: records.slice(0, 10).map(({ id, kind, quantity, unitPriceCents, reference, createdAt }) => ({
        id,
        kind,
        quantity,
        unitPriceCents,
        reference,
        createdAt,
      })),
    };
  }

  async account(user: AuthenticatedUser) {
    const [subscription, usage, entitlements] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { userId: user.id },
        select: {
          status: true,
          startedAt: true,
          canceledAt: true,
          plan: { select: planPublicSelect },
        },
      }),
      this.usageSummary(user.id),
      this.entitlements(user),
    ]);
    return { paymentsEnabled: PAYMENTS_ENABLED, subscription, usage, entitlements };
  }

  async subscribe(user: AuthenticatedUser, planId: unknown) {
    if (typeof planId !== 'string') throw new BadRequestException('Choose a plan');
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundException('That plan isn’t available');
    await this.plans.assign(user.id, { planId: plan.id, status: 'active' });
    return this.account(user);
  }

  async cancel(user: AuthenticatedUser) {
    const sub = await this.prisma.subscription.findUnique({ where: { userId: user.id } });
    if (!sub || sub.status === 'canceled') throw new ConflictException('You don’t have an active plan to cancel');
    await this.plans.assign(user.id, { planId: sub.planId, status: 'canceled' });
    return this.account(user);
  }

  // Called when a signed-in user starts a live session: on a pay-as-you-go
  // plan that's one billable session. Returns whether it was metered.
  async recordSessionHosted(userId: string, roomCode: string) {
    const plan = await this.plans.activePlan(userId);
    if (!plan || plan.billingType !== 'payg') return false;
    await this.prisma.usageRecord.create({
      data: { userId, kind: 'session', quantity: 1, unitPriceCents: plan.unitPriceCents, reference: roomCode },
    });
    return true;
  }
}
