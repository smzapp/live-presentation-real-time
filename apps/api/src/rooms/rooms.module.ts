import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller.js';
import { RoomsGateway } from './rooms.gateway.js';
import { RoomsService } from './rooms.service.js';
import { LiveKitService } from './livekit.service.js';
import { RoomStore } from './room-store.service.js';

@Module({
  controllers: [RoomsController],
  providers: [RoomStore, RoomsService, RoomsGateway, LiveKitService],
})
export class RoomsModule {}
