import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AppSettings {
  // When false, POST /auth/register is refused (admins can still create users).
  allowRegistration: boolean;
  // Plan assigned to newly registered users; null leaves them without one.
  defaultPlanId: string | null;
  // Shown at the top of every signed-in user's dashboard when non-empty.
  announcement: string;
}

const DEFAULTS: AppSettings = {
  allowRegistration: true,
  defaultPlanId: null,
  announcement: '',
};

// Stored as one JSON-encoded row per key so new settings don't need a migration.
@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await this.prisma.appSetting.upsert({
        where: { key },
        update: {},
        create: { key, value: JSON.stringify(value) },
      });
    }
  }

  async getAll(): Promise<AppSettings> {
    const rows = await this.prisma.appSetting.findMany();
    const settings: AppSettings = { ...DEFAULTS };
    for (const row of rows) {
      if (!(row.key in DEFAULTS)) continue;
      try {
        (settings as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value);
      } catch {
        // Leave the default in place for a corrupt value.
      }
    }
    return settings;
  }

  async update(input: Record<string, unknown>): Promise<AppSettings> {
    const patch: Partial<AppSettings> = {};
    if (input.allowRegistration !== undefined) {
      if (typeof input.allowRegistration !== 'boolean') throw new BadRequestException('allowRegistration must be a boolean');
      patch.allowRegistration = input.allowRegistration;
    }
    if (input.defaultPlanId !== undefined) {
      if (input.defaultPlanId !== null && typeof input.defaultPlanId !== 'string') {
        throw new BadRequestException('defaultPlanId must be a plan id or null');
      }
      if (typeof input.defaultPlanId === 'string') {
        const plan = await this.prisma.plan.findUnique({ where: { id: input.defaultPlanId } });
        if (!plan || !plan.isActive) throw new BadRequestException('Default plan must be an active plan');
      }
      patch.defaultPlanId = input.defaultPlanId;
    }
    if (input.announcement !== undefined) {
      if (typeof input.announcement !== 'string' || input.announcement.length > 280) {
        throw new BadRequestException('Announcement must be text of at most 280 characters');
      }
      patch.announcement = input.announcement.trim();
    }

    for (const [key, value] of Object.entries(patch)) {
      await this.prisma.appSetting.upsert({
        where: { key },
        update: { value: JSON.stringify(value) },
        create: { key, value: JSON.stringify(value) },
      });
    }
    return this.getAll();
  }
}
