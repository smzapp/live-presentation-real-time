// subscriber: a regular account (with or without a plan). support: a support
// agent, who answers the chats a super admin assigns them. superadmin: manages
// users, plans, statistics, media, drawing options and support.
export type UserRole = 'subscriber' | 'support' | 'superadmin';
export type UserStatus = 'active' | 'suspended';

// Per-user override of the media tool permissions their plan grants.
export type MediaAccess = 'plan' | 'full' | 'none';
export const MEDIA_ACCESS: MediaAccess[] = ['plan', 'full', 'none'];

export const USER_ROLES: UserRole[] = ['subscriber', 'support', 'superadmin'];

export function isStaff(role: string | undefined) {
  return role === 'superadmin' || role === 'support';
}
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
