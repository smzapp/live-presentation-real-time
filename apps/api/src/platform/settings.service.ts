import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_DRAWING_TOOLS,
  DEFAULT_TEXT_FONTS,
  DRAWING_TOOLS,
  FONT_FAMILY_PATTERN,
  GOOGLE_FONT_PATTERN,
  MAX_TEXT_FONTS,
  TOOL_AVAILABILITY,
  normalizeDrawingTools,
  normalizeTextFonts,
  type DrawingToolSettings,
  type TextFont,
  type ToolAvailability,
} from './drawing-tools.js';

export const GUEST_MEDIA_ACCESS = ['none', 'icons', 'library'] as const;
export type GuestMediaAccess = (typeof GUEST_MEDIA_ACCESS)[number];

export interface AppSettings {
  // When false, POST /auth/register is refused (admins can still create users).
  allowRegistration: boolean;
  // Plan assigned to newly registered users; null leaves them without one.
  defaultPlanId: string | null;
  // Shown at the top of every signed-in user's dashboard when non-empty.
  announcement: string;
  // What the whiteboard media tool offers people who aren't signed in
  // (students who joined a live session with just a name).
  guestMedia: GuestMediaAccess;
  // Which whiteboard tools are available to everyone, only to paid plans,
  // or to no one (see drawing-tools.ts).
  drawingTools: DrawingToolSettings;
  // Typefaces the text tool offers.
  textFonts: TextFont[];
}

const DEFAULTS: AppSettings = {
  allowRegistration: true,
  defaultPlanId: null,
  announcement: '',
  guestMedia: 'icons',
  drawingTools: DEFAULT_DRAWING_TOOLS,
  textFonts: DEFAULT_TEXT_FONTS,
};

// Stored as one JSON-encoded row per key so new settings don't need a
// migration. Kept in memory as well: the live-session gateway checks the
// drawing tools on every stroke and can't afford a query each time.
@Injectable()
export class SettingsService implements OnModuleInit {
  private cache: AppSettings = { ...DEFAULTS };

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await this.prisma.appSetting.upsert({
        where: { key },
        update: {},
        create: { key, value: JSON.stringify(value) },
      });
    }
    await this.reload();
  }

  // The last loaded settings, without touching the database.
  current(): AppSettings {
    return this.cache;
  }

  async getAll(): Promise<AppSettings> {
    return this.cache;
  }

  private async reload() {
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
    settings.drawingTools = normalizeDrawingTools(settings.drawingTools);
    settings.textFonts = normalizeTextFonts(settings.textFonts);
    this.cache = settings;
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
    if (input.guestMedia !== undefined) {
      if (!GUEST_MEDIA_ACCESS.includes(input.guestMedia as GuestMediaAccess)) {
        throw new BadRequestException('guestMedia must be "none", "icons" or "library"');
      }
      patch.guestMedia = input.guestMedia as GuestMediaAccess;
    }
    if (input.drawingTools !== undefined) {
      const value = input.drawingTools;
      if (!value || typeof value !== 'object') throw new BadRequestException('drawingTools must be an object');
      for (const [tool, availability] of Object.entries(value)) {
        if (!(DRAWING_TOOLS as readonly string[]).includes(tool)) {
          throw new BadRequestException(`Unknown drawing tool "${tool}"`);
        }
        if (!TOOL_AVAILABILITY.includes(availability as ToolAvailability)) {
          throw new BadRequestException(`${tool} must be "on", "premium" or "off"`);
        }
      }
      patch.drawingTools = normalizeDrawingTools({ ...this.cache.drawingTools, ...value });
    }

    if (input.textFonts !== undefined) {
      if (!Array.isArray(input.textFonts)) throw new BadRequestException('textFonts must be a list');
      if (input.textFonts.length === 0) throw new BadRequestException('Keep at least one font');
      if (input.textFonts.length > MAX_TEXT_FONTS) throw new BadRequestException(`At most ${MAX_TEXT_FONTS} fonts`);
      for (const font of input.textFonts as Record<string, unknown>[]) {
        const label = typeof font?.label === 'string' ? font.label.trim() : '';
        if (!label || label.length > 40) throw new BadRequestException('Each font needs a name of at most 40 characters');
        if (typeof font.family !== 'string' || !FONT_FAMILY_PATTERN.test(font.family)) {
          throw new BadRequestException(
            `"${label}": the font family may only use letters, digits, spaces, quotes, commas, dots and hyphens`,
          );
        }
        if (font.google !== undefined && font.google !== '' && (typeof font.google !== 'string' || !GOOGLE_FONT_PATTERN.test(font.google))) {
          throw new BadRequestException(`"${label}": the Google Font name may only use letters, digits and spaces`);
        }
      }
      const withIds = (input.textFonts as Record<string, unknown>[]).map((font, i) => ({
        ...font,
        label: String(font.label).trim(),
        google: font.google || undefined,
        id:
          typeof font.id === 'string' && /^[a-z0-9-]{1,40}$/.test(font.id)
            ? font.id
            : `${String(font.label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'font'}-${i}`,
      }));
      const normalized = normalizeTextFonts(withIds);
      if (normalized.length !== withIds.length) throw new BadRequestException('Font names and ids must be unique');
      patch.textFonts = normalized;
    }

    for (const [key, value] of Object.entries(patch)) {
      await this.prisma.appSetting.upsert({
        where: { key },
        update: { value: JSON.stringify(value) },
        create: { key, value: JSON.stringify(value) },
      });
    }
    await this.reload();
    return this.cache;
  }
}
