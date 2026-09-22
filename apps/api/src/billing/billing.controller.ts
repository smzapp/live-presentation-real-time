import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthService } from '../auth/auth.service.js';
import type { RequestWithUser } from '../auth/auth.types.js';
import { BillingService } from './billing.service.js';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // Public: the subscribe page shows plans to signed-out visitors too.
  @Get('plans')
  plans() {
    return this.billing.listPlans();
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: RequestWithUser) {
    return this.billing.account(req.user);
  }

  @Post('subscribe')
  @UseGuards(AuthGuard)
  subscribe(@Req() req: RequestWithUser, @Body('planId') planId: unknown) {
    return this.billing.subscribe(req.user, planId);
  }

  @Post('cancel')
  @UseGuards(AuthGuard)
  cancel(@Req() req: RequestWithUser) {
    return this.billing.cancel(req.user);
  }
}

// The whiteboard tools the viewer may use outside a live session (their own
// boards). Live sessions get theirs in the room snapshot instead.
@Controller('drawing')
export class DrawingController {
  constructor(
    private readonly billing: BillingService,
    private readonly auth: AuthService,
  ) {}

  @Get('tools')
  async tools(@Req() req: Request) {
    const header = req.headers.authorization;
    const user = header?.startsWith('Bearer ') ? await this.auth.verifyToken(header.slice(7)) : null;
    return this.billing.entitlements(user);
  }
}
