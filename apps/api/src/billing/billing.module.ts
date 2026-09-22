import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { BillingController, DrawingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [BillingController, DrawingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
