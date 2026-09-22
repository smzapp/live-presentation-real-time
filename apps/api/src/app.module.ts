import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BoardsModule } from './boards/boards.module.js';
import { AdminModule } from './admin/admin.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { MediaModule } from './media/media.module.js';
import { BillingModule } from './billing/billing.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

@Module({
  imports: [PrismaModule, PlatformModule, AuthModule, BoardsModule, RoomsModule, AdminModule, MediaModule, BillingModule, RealtimeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
