import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlansService } from '../platform/plans.service.js';
import { SettingsService } from '../platform/settings.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

export type MediaScope = 'library' | 'user';

// What the whiteboard media tool offers the current viewer. Resolved from, in
// order: super admin role, the user's own override (User.mediaAccess), their
// active plan, and for people who aren't signed in, the guestMedia setting.
export interface MediaPermissions {
  icons: boolean;
  library: boolean;
  upload: boolean;
  uploadLimit: number | null;
  uploadsUsed: number;
  manageLibrary: boolean;
  // Why uploading (or everything) is unavailable, shown in the media panel.
  notice: string | null;
}

// Clients downscale before uploading (see apps/web lib/media), so these are
// generous backstops rather than targets.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_THUMB_BYTES = 300 * 1024;
const MAX_LIBRARY_ASSETS = 2000;

const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

// SVG is deliberately not accepted: it can carry script, and these files are
// served from the API's own origin.
function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 6 && bytes.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

function decodeImage(value: unknown, maxBytes: number, label: string) {
  if (typeof value !== 'string') throw new BadRequestException(`${label} is required`);
  const match = DATA_URL.exec(value);
  if (!match) throw new BadRequestException(`${label} must be a PNG, JPEG, WebP or GIF image`);
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0) throw new BadRequestException(`${label} is empty`);
  if (bytes.length > maxBytes) {
    throw new BadRequestException(`${label} is too large (max ${Math.round(maxBytes / 1024)} KB)`);
  }
  const actual = sniffImageType(bytes);
  if (!actual || actual !== match[1]) {
    throw new BadRequestException(`${label} isn't a valid PNG, JPEG, WebP or GIF file`);
  }
  return { bytes, mimeType: actual };
}

function dimension(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 10000) {
    throw new BadRequestException('Image width and height must be whole numbers of pixels');
  }
  return value as number;
}

const assetSummary = {
  id: true,
  scope: true,
  name: true,
  mimeType: true,
  width: true,
  height: true,
  size: true,
  createdAt: true,
} as const;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
  ) {}

  async permissionsFor(user: AuthenticatedUser | null): Promise<MediaPermissions> {
    const none: MediaPermissions = {
      icons: false,
      library: false,
      upload: false,
      uploadLimit: 0,
      uploadsUsed: 0,
      manageLibrary: false,
      notice: null,
    };

    if (!user) {
      const { guestMedia } = await this.settings.getAll();
      return {
        ...none,
        icons: guestMedia !== 'none',
        library: guestMedia === 'library',
        notice:
          guestMedia === 'none'
            ? 'Media isn’t available in this session.'
            : 'Sign in to upload your own images.',
      };
    }

    const uploadsUsed = await this.prisma.mediaAsset.count({ where: { ownerId: user.id, scope: 'user' } });

    if (user.role === 'superadmin') {
      return { icons: true, library: true, upload: true, uploadLimit: null, uploadsUsed, manageLibrary: true, notice: null };
    }

    const account = await this.prisma.user.findUnique({ where: { id: user.id }, select: { mediaAccess: true } });
    if (account?.mediaAccess === 'none') {
      return { ...none, uploadsUsed, notice: 'An admin has turned off media for your account.' };
    }
    if (account?.mediaAccess === 'full') {
      return { icons: true, library: true, upload: true, uploadLimit: null, uploadsUsed, manageLibrary: false, notice: null };
    }

    const sub = await this.plans.forUser(user.id);
    if (!sub || sub.status === 'canceled' || !sub.plan.isActive) {
      return {
        ...none,
        icons: true,
        uploadsUsed,
        notice: 'Your account has no active plan, so only icons are available.',
      };
    }
    const { plan } = sub;
    const atLimit = plan.maxMediaUploads !== null && uploadsUsed >= plan.maxMediaUploads;
    return {
      icons: true,
      library: plan.mediaLibrary,
      upload: plan.mediaUpload,
      uploadLimit: plan.mediaUpload ? plan.maxMediaUploads : 0,
      uploadsUsed,
      manageLibrary: false,
      notice: !plan.mediaUpload
        ? `Uploading images isn’t included in your ${plan.name} plan.`
        : atLimit
          ? `You’ve used all ${plan.maxMediaUploads} uploads in your ${plan.name} plan. Delete one to add another.`
          : null,
    };
  }

  async list(user: AuthenticatedUser | null) {
    const perms = await this.permissionsFor(user);
    const [library, mine] = await Promise.all([
      perms.library || perms.manageLibrary
        ? this.prisma.mediaAsset.findMany({
            where: { scope: 'library' },
            select: assetSummary,
            orderBy: { createdAt: 'desc' },
          })
        : [],
      user
        ? this.prisma.mediaAsset.findMany({
            where: { scope: 'user', ownerId: user.id },
            select: assetSummary,
            orderBy: { createdAt: 'desc' },
          })
        : [],
    ]);
    return { permissions: perms, library, mine };
  }

  async listLibrary() {
    return this.prisma.mediaAsset.findMany({
      where: { scope: 'library' },
      select: { ...assetSummary, owner: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: AuthenticatedUser, input: Record<string, unknown>) {
    const scope: MediaScope = input.scope === 'library' ? 'library' : 'user';
    const perms = await this.permissionsFor(user);

    if (scope === 'library') {
      if (!perms.manageLibrary) throw new ForbiddenException('Only super admins can add to the shared library');
      if ((await this.prisma.mediaAsset.count({ where: { scope: 'library' } })) >= MAX_LIBRARY_ASSETS) {
        throw new ForbiddenException(`The library is full (${MAX_LIBRARY_ASSETS} images)`);
      }
    } else {
      if (!perms.upload) throw new ForbiddenException(perms.notice ?? 'Uploading images isn’t allowed for your account');
      if (perms.uploadLimit !== null && perms.uploadsUsed >= perms.uploadLimit) {
        throw new ForbiddenException(perms.notice ?? 'You’ve reached your upload limit');
      }
    }

    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
    const image = decodeImage(input.data, MAX_IMAGE_BYTES, 'Image');
    const thumb = decodeImage(input.thumb, MAX_THUMB_BYTES, 'Preview');

    return this.prisma.mediaAsset.create({
      data: {
        scope,
        ownerId: user.id,
        name: name || 'Untitled image',
        mimeType: image.mimeType,
        width: dimension(input.width),
        height: dimension(input.height),
        size: image.bytes.length,
        data: new Uint8Array(image.bytes),
        thumb: new Uint8Array(thumb.bytes),
        thumbType: thumb.mimeType,
      },
      select: assetSummary,
    });
  }

  // Library images are readable by anyone allowed to browse the library;
  // uploads only by their owner.
  async read(user: AuthenticatedUser | null, id: string, variant: 'file' | 'thumb') {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      select: {
        scope: true,
        ownerId: true,
        mimeType: true,
        thumbType: true,
        data: variant === 'file',
        thumb: variant === 'thumb',
      },
    });
    if (!asset) throw new NotFoundException('Image not found');
    if (asset.scope === 'library') {
      const perms = await this.permissionsFor(user);
      if (!perms.library && !perms.manageLibrary) throw new NotFoundException('Image not found');
    } else if (!user || asset.ownerId !== user.id) {
      throw new NotFoundException('Image not found');
    }
    return variant === 'file'
      ? { bytes: Buffer.from(asset.data!), mimeType: asset.mimeType }
      : { bytes: Buffer.from(asset.thumb!), mimeType: asset.thumbType };
  }

  async remove(user: AuthenticatedUser, id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id }, select: { scope: true, ownerId: true } });
    if (!asset) throw new NotFoundException('Image not found');
    const allowed =
      asset.scope === 'library' ? user.role === 'superadmin' : asset.ownerId === user.id;
    if (!allowed) throw new NotFoundException('Image not found');
    await this.prisma.mediaAsset.delete({ where: { id } });
    return { ok: true };
  }
}
