import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export type AuthenticatedRequest = { user?: AuthenticatedUser; ip?: string };

/** Injects the authenticated principal set by the global JWT guard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user as AuthenticatedUser;
});
