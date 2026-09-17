import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestWithUser } from '../auth/auth.types.js';
import { FoldersService } from './folders.service.js';

@Controller('folders')
@UseGuards(AuthGuard)
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  list(@Req() req: RequestWithUser) {
    return this.folders.list(req.user.id);
  }

  @Post()
  create(@Req() req: RequestWithUser, @Body() body: { name?: unknown }) {
    return this.folders.create(req.user.id, body);
  }

  @Patch(':id')
  rename(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: { name?: unknown }) {
    return this.folders.rename(req.user.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.folders.remove(req.user.id, id);
  }
}
