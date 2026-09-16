export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface RequestWithUser {
  user: AuthenticatedUser;
}
