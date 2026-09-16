import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestWithUser } from '../auth/auth.types.js';
import { BoardsService } from './boards.service.js';

@Controller('boards')
@UseGuards(AuthGuard)
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  list(@Req() req: RequestWithUser, @Query('type') type?: string) {
    return this.boards.list(req.user.id, type);
  }

  @Post('import')
  import(@Req() req: RequestWithUser, @Body() body: { title?: unknown; type?: unknown; data?: unknown }) {
    return this.boards.importBoard(req.user.id, body);
  }

  @Get(':id/export')
  async export(@Req() req: RequestWithUser, @Param('id') id: string, @Res() res: Response) {
    const payload = await this.boards.exportBoard(req.user.id, id);
    const safeName = payload.title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'board';
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  }

  @Get(':id')
  get(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.boards.get(req.user.id, id);
  }

  @Post()
  create(@Req() req: RequestWithUser, @Body() body: { type: unknown; title?: unknown; data: unknown }) {
    return this.boards.create(req.user.id, body);
  }

  @Patch(':id')
  update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: { title?: unknown; data?: unknown }) {
    return this.boards.update(req.user.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.boards.remove(req.user.id, id);
  }
}
