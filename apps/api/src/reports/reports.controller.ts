import { Controller, Get, Header, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestWithUser } from '../auth/auth.types.js';
import { ReportsService } from './reports.service.js';

// Attendance and participation for the sessions someone hosted.
@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sessions')
  listSessions(@Req() req: RequestWithUser, @Query('page') page?: string) {
    return this.reports.listSessions(req.user, Number(page) || 1);
  }

  @Get('sessions/:code')
  session(@Req() req: RequestWithUser, @Param('code') code: string) {
    return this.reports.session(req.user, code);
  }

  @Get('sessions/:code/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(@Req() req: RequestWithUser, @Param('code') code: string, @Res() res: Response) {
    const { filename, body } = await this.reports.csv(req.user, code);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }
}
