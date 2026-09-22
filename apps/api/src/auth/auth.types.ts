export type UserRole = 'user' | 'superadmin';
export type UserStatus = 'active' | 'suspended';

// Per-user override of the media tool permissions their plan grants.
export type MediaAccess = 'plan' | 'full' | 'none';
export const MEDIA_ACCESS: MediaAccess[] = ['plan', 'full', 'none'];

export const USER_ROLES: UserRole[] = ['user', 'superadmin'];
export const USER_STATUSES: UserStatus[] = ['active', 'suspended'];

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface RequestWithUser {
  user: AuthenticatedUser;
}
