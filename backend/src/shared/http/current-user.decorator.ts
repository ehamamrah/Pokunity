import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/** Token facts needed for revocation (logout). */
export interface SessionClaims {
  jti: string | null;
  ver: number;
  exp: number;
}

export type AuthenticatedRequest = { user?: AuthenticatedUser; session?: SessionClaims; ip?: string };

/** Injects the authenticated principal set by the global JWT guard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user as AuthenticatedUser;
});
