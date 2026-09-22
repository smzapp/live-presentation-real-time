import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { SuperAdminGuard } from '../auth/admin.guard.js';
import type { AuthenticatedUser, RequestWithUser } from '../auth/auth.types.js';
import { MediaService } from './media.service.js';

@Controller('media')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly auth: AuthService,
  ) {}

  // The media tool is also used by students who joined a session without an
  // account, so reads work signed out too; a bearer token, when present,
  // unlocks whatever that user's plan allows.
  private async viewer(req: Request): Promise<AuthenticatedUser | null> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return this.auth.verifyToken(header.slice('Bearer '.length));
  }

  @Get()
  async list(@Req() req: Request) {
    return this.media.list(await this.viewer(req));
  }

  @Get('library')
  @UseGuards(SuperAdminGuard)
  listLibrary() {
    return this.media.listLibrary();
  }

  @Get(':id/thumb')
  async thumb(@Req() req: Request, @Res() res: Response, @Param('id') id: string) {
    this.send(res, await this.media.read(await this.viewer(req), id, 'thumb'));
  }

  @Get(':id/file')
  async file(@Req() req: Request, @Res() res: Response, @Param('id') id: string) {
    this.send(res, await this.media.read(await this.viewer(req), id, 'file'));
  }

  @Post()
  @UseGuards(AuthGuard)
  create(@Req() req: RequestWithUser, @Body() body: Record<string, unknown>) {
    return this.media.create(req.user, body ?? {});
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.media.remove(req.user, id);
  }

  // An asset's bytes never change for a given id, so it can be cached hard —
  // but privately, since access depends on who's asking.
  private send(res: Response, file: { bytes: Buffer; mimeType: string }) {
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.send(file.bytes);
  }
}
