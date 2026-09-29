import { Body, Controller, Get, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RoomsService } from './rooms.service.js';
import { AttendanceService } from './attendance.service.js';
import { AuthService } from '../auth/auth.service.js';
import { BillingService } from '../billing/billing.service.js';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly auth: AuthService,
    private readonly billing: BillingService,
    private readonly attendance: AttendanceService,
  ) {}

  // Anyone can start a session, but a signed-in host brings their plan with
  // them: paid drawing tools for the room, and on pay-as-you-go, one metered
  // session.
  @Post()
  async create(@Req() req: Request, @Body('title') title?: string) {
    const header = req.headers.authorization;
    const user = header?.startsWith('Bearer ') ? await this.auth.verifyToken(header.slice(7)) : null;
    const owner = user
      ? { id: user.id, premiumTools: (await this.billing.entitlements(user)).premiumTools }
      : undefined;
    const room = await this.rooms.createRoom(title ?? 'Untitled session', owner);
    // Logged here rather than in RoomsService so the register exists from the
    // moment the session does, even if nobody ever joins it.
    await this.attendance.sessionStarted(room);
    if (user) await this.billing.recordSessionHosted(user.id, room.code);
    return {
      code: room.code,
      title: room.title,
      hostToken: room.hostToken,
    };
  }

  // Public: the join page uses this to show the session's name, find out
  // whether it needs a passcode, and check the one it was given before
  // opening the room. The passcode itself is never returned — only whether
  // it matches — and the socket checks it again when actually joining.
  @Get(':code')
  async lookup(@Param('code') code: string, @Query('key') key?: string) {
    const room = await this.rooms.loadRoom(code);
    if (!room) throw new NotFoundException('Room not found');
    return {
      code: room.code,
      title: room.title,
      mode: room.mode,
      participantCount: this.rooms.onlineCount(room),
      // Whether the join page has to ask for a passcode, and whether the one
      // it already has is good.
      requireKey: room.requireKey,
      keyValid: this.rooms.isJoinKeyValid(room, key),
    };
  }
}
