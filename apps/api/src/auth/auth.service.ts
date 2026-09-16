import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from './auth.types.js';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo1234';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // The demo account is provisioned here (rather than via a one-off seed
  // script someone has to remember to run) so it always exists on a fresh
  // checkout the moment the API boots.
  async onModuleInit() {
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

  async login(email: string, password: string): Promise<{ token: string; user: AuthenticatedUser }> {
    const user = email ? await this.prisma.user.findUnique({ where: { email } }) : null;
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email, name: user.name } };
  }

  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return null;
      return { id: user.id, email: user.email, name: user.name };
    } catch {
      return null;
    }
  }
}
