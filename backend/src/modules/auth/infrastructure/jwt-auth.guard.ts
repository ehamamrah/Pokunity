import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppError, Errors } from '../../../shared/errors/app-error';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { AuthenticatedRequest } from '../../../shared/http/current-user.decorator';
import { IS_PUBLIC, SESSION_POLICY } from '../../../shared/http/public.decorator';
import { SessionVersionCache } from './session-version.cache';
import { TokenDenylist } from './token-denylist';
import { TokenService, VerifiedToken } from './token.service';

type Policy = 'strict' | 'allow-revoked' | undefined;

/**
 * Global guard: every route requires a valid Bearer JWT unless marked @Public(). A token is rejected
 * (401) when expired, when its `ver` is older than the member's token version (log out everywhere) or
 * when its `jti` is on the denylist (log out). If the denylist cannot be checked (Redis down), reads
 * proceed but `strict` (money-moving) routes fail closed with 503 SERVICE_UNAVAILABLE.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly versions: SessionVersionCache,
    private readonly denylist: TokenDenylist,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const verified = await this.verify(req.header('authorization'));
    const policy = this.reflector.getAllAndOverride<Policy>(SESSION_POLICY, targets);
    if (policy !== 'allow-revoked') await this.assertNotRevoked(verified, policy);
    req.user = verified.user;
    req.session = verified.session;
    return true;
  }

  private async verify(header: string | undefined): Promise<VerifiedToken> {
    const [scheme, token] = (header ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw Errors.unauthorized();
    return this.tokens.verify(token).catch(() => {
      throw Errors.unauthorized();
    });
  }

  private async assertNotRevoked({ user, session }: VerifiedToken, policy: Policy): Promise<void> {
    const [current, status] = await Promise.all([this.versions.versionOf(user.id), this.denylist.status(session.jti)]);
    if (current === null || session.ver < current || status === 'revoked') throw Errors.unauthorized();
    if (status === 'unknown' && policy === 'strict') throw sessionUnverifiable();
  }
}

function sessionUnverifiable(): AppError {
  return new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Your session cannot be verified right now. Please retry shortly.', null, {
    'Retry-After': '5',
  });
}
