import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { MIN_PASSWORD_LENGTH, normalizeEmail, validateRegistration } from '../auth/auth.service.js';
import {
  MEDIA_ACCESS,
  USER_ROLES,
  USER_STATUSES,
  type MediaAccess,
  type UserRole,
  type UserStatus,
} from '../auth/auth.types.js';
import { LIVE_STATUSES, PlansService } from '../platform/plans.service.js';

const PAGE_SIZE = 20;

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  mediaAccess: true,
  createdAt: true,
  lastLoginAt: true,
  subscription: { select: { status: true, plan: { select: { id: true, name: true } } } },
  _count: { select: { boards: true } },
} as const;

type SelectedUser = {
  _count: { boards: number };
} & Record<string, unknown>;

function shapeUser({ _count, ...user }: SelectedUser) {
  return { ...user, boardCount: _count.boards };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  async stats() {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now - 13 * 24 * 60 * 60 * 1000);
    twoWeeksAgo.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const activeWindow = new Date(now - 15 * 60 * 1000);

    const [users, newUsers, suspended, admins, boards, plans, liveSubs, usage, sessionsThisWeek, liveNow, media, recentUsers] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
        this.prisma.user.count({ where: { status: 'suspended' } }),
        this.prisma.user.count({ where: { role: 'superadmin' } }),
        this.prisma.board.count(),
        this.plans.list(),
        this.prisma.subscription.findMany({
          where: { status: { in: LIVE_STATUSES } },
          select: { plan: { select: { priceCents: true, interval: true, billingType: true } } },
        }),
        this.prisma.usageRecord.findMany({
          where: { createdAt: { gte: monthStart } },
          select: { quantity: true, unitPriceCents: true, userId: true },
        }),
        this.prisma.liveRoom.count({ where: { createdAt: { gte: weekAgo } } }),
        this.prisma.liveRoom.count({ where: { lastActivityAt: { gte: activeWindow } } }),
        this.prisma.mediaAsset.count(),
        this.prisma.user.findMany({ where: { createdAt: { gte: twoWeeksAgo } }, select: { createdAt: true } }),
      ]);

    // Recurring revenue from flat-price plans, normalized to a month.
    const mrrCents = liveSubs.reduce((sum, { plan }) => {
      if (plan.billingType === 'payg') return sum;
      return sum + (plan.interval === 'year' ? Math.round(plan.priceCents / 12) : plan.priceCents);
    }, 0);

    const signups: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      signups.push({ date: day, count: 0 });
    }
    for (const u of recentUsers) {
      const entry = signups.find((d) => d.date === u.createdAt.toISOString().slice(0, 10));
      if (entry) entry.count++;
    }

    const withoutPlan = users - plans.reduce((sum, p) => sum + p.subscriberCount, 0);
    return {
      users,
      newUsersThisWeek: newUsers,
      suspendedUsers: suspended,
      superAdmins: admins,
      boards,
      mediaAssets: media,
      activeSubscriptions: liveSubs.length,
      mrrCents,
      payAsYouGo: {
        sessions: usage.reduce((sum, r) => sum + r.quantity, 0),
        amountCents: usage.reduce((sum, r) => sum + r.quantity * r.unitPriceCents, 0),
        users: new Set(usage.map((r) => r.userId)).size,
      },
      liveSessions: { thisWeek: sessionsThisWeek, activeNow: liveNow },
      signups,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        subscribers: p.subscriberCount,
        isActive: p.isActive,
        billingType: p.billingType,
      })),
      usersWithoutPlan: withoutPlan,
    };
  }

  async listUsers(query: { search?: string; page?: string; role?: string; status?: string }) {
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const search = query.search?.trim();
    const where = {
      ...(search ? { OR: [{ email: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }] } : {}),
      ...(query.role && USER_ROLES.includes(query.role as UserRole) ? { role: query.role } : {}),
      ...(query.status && USER_STATUSES.includes(query.status as UserStatus) ? { status: query.status } : {}),
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    return { users: users.map(shapeUser), total, page, pageSize: PAGE_SIZE };
  }

  async createUser(input: { name?: unknown; email?: unknown; password?: unknown; role?: unknown }) {
    const { name, email, password } = validateRegistration(input);
    const role = input.role === undefined ? 'subscriber' : input.role;
    if (!USER_ROLES.includes(role as UserRole)) throw new BadRequestException('Invalid role');
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('An account with that email already exists');
    }
    const user = await this.prisma.user.create({
      data: { name, email, role: role as UserRole, passwordHash: await bcrypt.hash(password, 10) },
    });
    await this.plans.assignDefault(user.id);
    return this.getUser(user.id);
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('User not found');
    return shapeUser(user);
  }

  async updateUser(
    actorId: string,
    id: string,
    input: {
      name?: unknown;
      email?: unknown;
      role?: unknown;
      status?: unknown;
      password?: unknown;
      mediaAccess?: unknown;
    },
  ) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');

    const data: {
      name?: string;
      email?: string;
      role?: string;
      status?: string;
      passwordHash?: string;
      mediaAccess?: string;
    } = {};
    if (input.mediaAccess !== undefined) {
      if (!MEDIA_ACCESS.includes(input.mediaAccess as MediaAccess)) {
        throw new BadRequestException('mediaAccess must be "plan", "full" or "none"');
      }
      data.mediaAccess = input.mediaAccess as MediaAccess;
    }
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) {
        throw new BadRequestException('Name is required (max 80 characters)');
      }
      data.name = input.name.trim();
    }
    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Invalid email address');
      if (email !== target.email && (await this.prisma.user.findUnique({ where: { email } }))) {
        throw new ConflictException('Another account already uses that email');
      }
      data.email = email;
    }
    if (input.role !== undefined) {
      if (!USER_ROLES.includes(input.role as UserRole)) throw new BadRequestException('Invalid role');
      data.role = input.role as UserRole;
    }
    if (input.status !== undefined) {
      if (!USER_STATUSES.includes(input.status as UserStatus)) throw new BadRequestException('Invalid status');
      data.status = input.status as UserStatus;
    }
    if (input.password !== undefined) {
      if (typeof input.password !== 'string' || input.password.length < MIN_PASSWORD_LENGTH) {
        throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      data.passwordHash = await bcrypt.hash(input.password, 10);
    }

    const losingAdmin =
      target.role === 'superadmin' &&
      target.status === 'active' &&
      ((data.role !== undefined && data.role !== 'superadmin') || data.status === 'suspended');
    if (losingAdmin) {
      if (id === actorId) throw new BadRequestException("You can't remove your own super admin access");
      await this.assertAnotherActiveAdmin(id);
    }

    await this.prisma.user.update({ where: { id }, data });
    return this.getUser(id);
  }

  async deleteUser(actorId: string, id: string) {
    if (id === actorId) throw new BadRequestException("You can't delete your own account here");
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'superadmin' && target.status === 'active') await this.assertAnotherActiveAdmin(id);
    // Boards, folders and the subscription cascade with the user.
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  async setSubscription(id: string, input: { planId?: unknown; status?: unknown }) {
    await this.getUser(id);
    await this.plans.assign(id, input);
    return this.getUser(id);
  }

  private async assertAnotherActiveAdmin(excludingId: string) {
    const others = await this.prisma.user.count({
      where: { role: 'superadmin', status: 'active', id: { not: excludingId } },
    });
    if (others === 0) throw new ConflictException('There must be at least one active super admin');
  }
}
