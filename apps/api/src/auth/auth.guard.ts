import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { RequestWithUser } from './auth.types.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Record<string, unknown> & Partial<RequestWithUser>>();
    const header = (req.headers as Record<string, string | undefined>)?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    const user = await this.auth.verifyToken(token);
    if (!user) throw new UnauthorizedException('Invalid or expired session');

    req.user = user;
    return true;
  }
}
