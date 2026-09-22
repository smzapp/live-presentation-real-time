import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { AppGateway } from './app.gateway.js';
import { OnlineController } from './online.controller.js';
import { PresenceService } from './presence.service.js';
import { SupportService } from './support.service.js';

// Presence ("who's online") and support chat.
@Module({
  imports: [AuthModule, RoomsModule],
  controllers: [OnlineController],
  providers: [AppGateway, PresenceService, SupportService],
})
export class RealtimeModule {}
