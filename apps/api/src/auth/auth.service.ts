import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlansService } from '../platform/plans.service.js';
import { SettingsService } from '../platform/settings.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  passwordChangedMessage,
  passwordResetMessage,
  verifyEmailMessage,
} from '../mail/templates.js';
import { USER_ROLES, type AuthenticatedUser, type UserRole } from './auth.types.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

// Emailed link lifetimes. A reset link is short-lived because it can take
// over an account; a verification link only confirms an address.
const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
// Nobody needs more than a handful of emails: further requests for the same
// address inside this window are accepted and quietly dropped, so this can't
// be used to flood someone's inbox.
const EMAIL_THROTTLE_MS = 5 * 60 * 1000;
const EMAILS_PER_WINDOW = 3;

export type AuthTokenKind = 'verify' | 'reset';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function validateRegistration(input: { name?: unknown; email?: unknown; password?: unknown }) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  if (!name || name.length > 80) throw new BadRequestException('Please enter your name (max 80 characters)');
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new BadRequestException('Please enter a valid email address');
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
    throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return { name, email, password };
}

function toAuthUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerifiedAt?: Date | null;
}): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: USER_ROLES.includes(user.role as UserRole) ? (user.role as UserRole) : 'subscriber',
    emailVerified: !!user.emailVerifiedAt,
  };
}

// The demo account (see .env.example). Set DEMO_ACCOUNT_ENABLED=false to
// stop it being created — e.g. in production.
export const DEMO_EMAIL = normalizeEmail(process.env.DEMO_EMAIL) || 'demo@example.com';
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';
const DEMO_ENABLED = process.env.DEMO_ACCOUNT_ENABLED !== 'false';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  // email -> times an email was sent to it recently (see EMAIL_THROTTLE_MS).
  private readonly recentEmails = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  // The demo account is provisioned here (rather than via a one-off seed
  // script someone has to remember to run) so it always exists on a fresh
  // checkout the moment the API boots.
  async onModuleInit() {
    await this.ensureSuperAdminFromEnv();
    await this.ensureDemoUser();
  }

  // Bootstraps the first super admin without shipping default admin
  // credentials: set SUPERADMIN_EMAIL (and SUPERADMIN_PASSWORD, used only if
  // that account doesn't exist yet). An existing account is just promoted.
  // Alternatively run `npm run admin:promote -- <email>`.
  private async ensureSuperAdminFromEnv() {
    const email = normalizeEmail(process.env.SUPERADMIN_EMAIL);
    if (!email) {
      const admins = await this.prisma.user.count({ where: { role: 'superadmin' } });
      if (admins === 0) {
        this.logger.warn('No super admin exists. Set SUPERADMIN_EMAIL or run: npm run admin:promote -- <email>');
      }
      return;
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.role !== 'superadmin' || existing.status !== 'active') {
        await this.prisma.user.update({ where: { id: existing.id }, data: { role: 'superadmin', status: 'active' } });
        this.logger.log(`Promoted ${email} to super admin`);
      }
      return;
    }
    const password = process.env.SUPERADMIN_PASSWORD ?? '';
    if (password.length < MIN_PASSWORD_LENGTH) {
      this.logger.warn(`SUPERADMIN_EMAIL is set but no account exists and SUPERADMIN_PASSWORD is missing or shorter than ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    await this.prisma.user.create({
      data: {
        email,
        name: 'Super Admin',
        role: 'superadmin',
        passwordHash: await bcrypt.hash(password, 10),
        emailVerifiedAt: new Date(),
      },
    });
    this.logger.log(`Created super admin ${email}`);
  }

  private async ensureDemoUser() {
    if (!DEMO_ENABLED) return;
    if (DEMO_PASSWORD.length < MIN_PASSWORD_LENGTH) {
      this.logger.warn(`DEMO_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters; demo account not created`);
      return;
    }
    const existing = await this.prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const user = await this.prisma.user.create({
      data: { email: DEMO_EMAIL, passwordHash, name: 'Demo User', emailVerifiedAt: new Date() },
    });

    await this.prisma.board.createMany({
      data: [
        {
          ownerId: user.id,
          type: 'whiteboard',
          title: 'Welcome board',
          data: JSON.stringify({
            strokes: [
              {
                id: 'welcome-text',
                tool: 'text',
                color: '#3457d5',
                width: 6,
                points: [{ x: 0.08, y: 0.08 }],
                text: 'Welcome! Draw something, then check My Boards.',
              },
            ],
          }),
        },
        {
          ownerId: user.id,
          type: 'presentation',
          title: 'Welcome deck',
          data: JSON.stringify({
            slides: [
              { id: 'slide-1', title: 'Welcome', body: 'This is a saved presentation tied to your account.' },
              { id: 'slide-2', title: 'Add slides', body: 'Use the editor to add, reorder, and edit slides.' },
            ],
          }),
        },
      ],
    });
  }

  async login(rawEmail: string, password: string): Promise<{ token: string; user: AuthenticatedUser }> {
    const email = normalizeEmail(rawEmail);
    const user = email ? await this.prisma.user.findUnique({ where: { email } }) : null;
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    // Checked only after the password matches, so this can't be used to probe
    // which emails have accounts.
    if (user.status === 'suspended') {
      throw new ForbiddenException('This account has been suspended. Contact your administrator.');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issue(user);
  }

  async register(input: { name?: unknown; email?: unknown; password?: unknown }) {
    const { allowRegistration } = await this.settings.getAll();
    if (!allowRegistration) throw new ForbiddenException('New registrations are currently closed');

    const { name, email, password } = validateRegistration(input);
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('An account with that email already exists');
    }
    const user = await this.prisma.user.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, 10), lastLoginAt: new Date() },
    });
    await this.plans.assignDefault(user.id);
    // They're signed in either way — the email only confirms the address.
    await this.sendVerificationEmail(user);
    return this.issue(user);
  }

  // ---- Emailed links ----

  // Returns false when this address has had its share of emails for now.
  private throttled(email: string) {
    const now = Date.now();
    const recent = (this.recentEmails.get(email) ?? []).filter((at) => now - at < EMAIL_THROTTLE_MS);
    if (recent.length >= EMAILS_PER_WINDOW) {
      this.recentEmails.set(email, recent);
      return true;
    }
    recent.push(now);
    this.recentEmails.set(email, recent);
    // Opportunistic cleanup: without it this map would grow forever on a
    // busy instance.
    if (this.recentEmails.size > 5000) {
      for (const [key, times] of this.recentEmails) {
        if (times.every((at) => now - at >= EMAIL_THROTTLE_MS)) this.recentEmails.delete(key);
      }
    }
    return false;
  }

  // Any unused token of the same kind is retired first, so only the newest
  // link in someone's inbox works.
  private async issueAuthToken(userId: string, kind: AuthTokenKind, ttlMs: number) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.authToken.updateMany({
      where: { userId, kind, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.authToken.create({
      data: { userId, kind, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
    });
    return token;
  }

  private async consumeAuthToken(token: unknown, kind: AuthTokenKind) {
    if (typeof token !== 'string' || !token) throw new BadRequestException('That link is not valid');
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!row || row.kind !== kind || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('That link has expired or has already been used');
    }
    await this.prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    return row.user;
  }

  async sendVerificationEmail(user: { id: string; email: string; name: string; emailVerifiedAt?: Date | null }) {
    if (user.emailVerifiedAt) return;
    if (this.throttled(user.email)) return;
    const token = await this.issueAuthToken(user.id, 'verify', VERIFY_TTL_MS);
    await this.mail.send(verifyEmailMessage(user.email, user.name, token));
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Not signed in');
    if (user.emailVerifiedAt) return { verified: true as const };
    await this.sendVerificationEmail(user);
    return { verified: false as const };
  }

  async verifyEmail(token: unknown) {
    const user = await this.consumeAuthToken(token, 'verify');
    if (!user.emailVerifiedAt) {
      await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    }
    return { email: user.email };
  }

  // Always reports success: whether an address has an account is not
  // something an unauthenticated caller gets to find out.
  async requestPasswordReset(rawEmail: unknown) {
    const email = normalizeEmail(rawEmail);
    if (!email) return { ok: true as const };
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'suspended') return { ok: true as const };
    if (this.throttled(email)) return { ok: true as const };
    const token = await this.issueAuthToken(user.id, 'reset', RESET_TTL_MS);
    await this.mail.send(passwordResetMessage(user.email, user.name, token));
    return { ok: true as const };
  }

  async resetPassword(token: unknown, password: unknown) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const user = await this.consumeAuthToken(token, 'reset');
    if (user.status === 'suspended') {
      throw new ForbiddenException('This account has been suspended. Contact your administrator.');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        // Following a link sent to that address proves it belongs to them.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        lastLoginAt: new Date(),
      },
    });
    await this.mail.send(passwordChangedMessage(updated.email, updated.name));
    // Signed straight in: they've just proved they own the address, and it
    // saves them retyping the password they only just chose.
    return this.issue(updated);
  }

  boardCount(userId: string) {
    return this.prisma.board.count({ where: { ownerId: userId } });
  }

  private async issue(user: {
    id: string;
    email: string;
    name: string;
    role: string;
    emailVerifiedAt: Date | null;
  }) {
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { token, user: toAuthUser(user) };
  }

  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status === 'suspended') return null;
      return toAuthUser(user);
    } catch {
      return null;
    }
  }
}
