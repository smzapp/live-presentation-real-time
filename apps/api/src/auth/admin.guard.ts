import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import type { RequestWithUser } from './auth.types.js';

// Authenticates like AuthGuard, then requires the super admin role. The role
// is re-read from the database on every request (via verifyToken), so a
// demotion takes effect immediately rather than when the JWT expires.
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly authGuard: AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.authGuard.canActivate(context);
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    if (req.user?.role !== 'superadmin') throw new ForbiddenException('Super admin access required');
    return true;
  }
}
