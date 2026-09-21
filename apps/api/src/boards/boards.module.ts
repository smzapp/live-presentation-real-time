import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { BoardsController } from './boards.controller.js';
import { BoardsService } from './boards.service.js';
import { FoldersController } from './folders.controller.js';
import { FoldersService } from './folders.service.js';

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [BoardsController, FoldersController],
  providers: [BoardsService, FoldersService],
})
export class BoardsModule {}
