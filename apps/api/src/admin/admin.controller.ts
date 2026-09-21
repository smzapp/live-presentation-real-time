import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from '../auth/admin.guard.js';
import type { RequestWithUser } from '../auth/auth.types.js';
import { PlansService } from '../platform/plans.service.js';
import { SettingsService } from '../platform/settings.service.js';
import { AdminService } from './admin.service.js';

@Controller('admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
  ) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  // ---- Users ----

  @Get('users')
  listUsers(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.listUsers({ search, page, role, status });
  }

  @Post('users')
  createUser(@Body() body: Record<string, unknown>) {
    return this.admin.createUser(body ?? {});
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Patch('users/:id')
  updateUser(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateUser(req.user.id, id, body ?? {});
  }

  @Delete('users/:id')
  deleteUser(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.admin.deleteUser(req.user.id, id);
  }

  @Put('users/:id/subscription')
  setSubscription(@Param('id') id: string, @Body() body: { planId?: unknown; status?: unknown }) {
    return this.admin.setSubscription(id, body ?? {});
  }

  // ---- Plans ----

  @Get('plans')
  listPlans() {
    return this.plans.list();
  }

  @Post('plans')
  createPlan(@Body() body: Record<string, unknown>) {
    return this.plans.create(body ?? {});
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.plans.update(id, body ?? {});
  }

  @Delete('plans/:id')
  deletePlan(@Param('id') id: string) {
    return this.plans.remove(id);
  }

  // ---- Settings ----

  @Get('settings')
  getSettings() {
    return this.settings.getAll();
  }

  @Patch('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.settings.update(body ?? {});
  }
}
