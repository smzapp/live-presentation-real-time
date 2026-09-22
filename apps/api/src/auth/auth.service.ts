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
import { PrismaService } from '../prisma/prisma.service.js';
import { PlansService } from '../platform/plans.service.js';
import { SettingsService } from '../platform/settings.service.js';
import type { AuthenticatedUser } from './auth.types.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

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

function toAuthUser(user: { id: string; email: string; name: string; role: string }): AuthenticatedUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role === 'superadmin' ? 'superadmin' : 'user' };
}

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo1234';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
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
      data: { email, name: 'Super Admin', role: 'superadmin', passwordHash: await bcrypt.hash(password, 10) },
    });
    this.logger.log(`Created super admin ${email}`);
  }

  private async ensureDemoUser() {
    const existing = await this.prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const user = await this.prisma.user.create({
      data: { email: DEMO_EMAIL, passwordHash, name: 'Demo User' },
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
    return this.issue(user);
  }

  boardCount(userId: string) {
    return this.prisma.board.count({ where: { ownerId: userId } });
  }

  private async issue(user: { id: string; email: string; name: string; role: string }) {
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
