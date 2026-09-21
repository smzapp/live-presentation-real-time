import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import type { RequestWithUser } from './auth.types.js';
import { PlansService } from '../platform/plans.service.js';
import { SettingsService } from '../platform/settings.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
  ) {}

  @Post('login')
  login(@Body('email') email?: string, @Body('password') password?: string) {
    return this.auth.login(email ?? '', password ?? '');
  }

  @Post('register')
  register(@Body() body: { name?: unknown; email?: unknown; password?: unknown }) {
    return this.auth.register(body ?? {});
  }

  // Public: lets the sign-up page say up front when registration is closed.
  @Get('config')
  async config() {
    const { allowRegistration } = await this.settings.getAll();
    return { allowRegistration };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: RequestWithUser) {
    return req.user;
  }

  // The signed-in user's plan plus anything app-wide their dashboard shows.
  @Get('me/account')
  @UseGuards(AuthGuard)
  async account(@Req() req: RequestWithUser) {
    const [subscription, boardCount, { announcement }] = await Promise.all([
      this.plans.forUser(req.user.id),
      this.auth.boardCount(req.user.id),
      this.settings.getAll(),
    ]);
    return { subscription, boardCount, announcement };
  }
}
