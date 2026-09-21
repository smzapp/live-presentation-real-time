import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformModule } from '../platform/platform.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { SuperAdminGuard } from './admin.guard.js';

@Module({
  imports: [
    PlatformModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, SuperAdminGuard],
  exports: [AuthService, AuthGuard, SuperAdminGuard],
})
export class AuthModule {}
