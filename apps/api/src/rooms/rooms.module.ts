import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsGateway } from './rooms.gateway.js';
import { RoomsService } from './rooms.service.js';
import { LiveKitService } from './livekit.service.js';
import { RoomStore } from './room-store.service.js';

@Module({
  imports: [AuthModule, PlatformModule, BillingModule],
  controllers: [RoomsController],
  providers: [RoomStore, RoomsService, RoomsGateway, LiveKitService],
})
export class RoomsModule {}
