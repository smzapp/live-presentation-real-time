import { Module } from '@nestjs/common';
import { PlansService } from './plans.service.js';
import { SettingsService } from './settings.service.js';

// Plans, subscriptions and app-wide settings. Deliberately has no dependency
// on AuthModule so auth (registration) and admin can both import it.
@Module({
  providers: [SettingsService, PlansService],
  exports: [SettingsService, PlansService],
})
export class PlatformModule {}
