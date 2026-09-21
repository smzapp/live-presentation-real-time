export type UserRole = 'user' | 'superadmin';
export type UserStatus = 'active' | 'suspended';

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
