import { Controller, Get, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from '../auth/admin.guard.js';
import { RoomsService } from '../rooms/rooms.service.js';
import { PresenceService } from './presence.service.js';

@Controller('admin/online')
@UseGuards(SuperAdminGuard)
export class OnlineController {
  constructor(
    private readonly presence: PresenceService,
    private readonly rooms: RoomsService,
  ) {}

  // Signed-in users and guest visitors with the app open, plus everyone
  // connected to a live session (students join those without an account).
  @Get()
  online() {
    const { users, guests } = this.presence.snapshot();
    const sessions = this.rooms.liveSummary();
    return {
      at: Date.now(),
      counts: {
        users: users.length,
        guests: guests.length,
        liveSessions: sessions.length,
        sessionParticipants: sessions.reduce((sum, s) => sum + s.participants.length, 0),
      },
      users,
      guests,
      sessions,
    };
  }
}
