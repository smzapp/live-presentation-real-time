import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
