import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errors } from '../errors/app-error';
import { AuthenticatedRequest } from './current-user.decorator';
import { RateLimitService } from './rate-limit.service';

export interface RateLimitPolicy {
  name: string;
  limit: number;
  windowSeconds: number;
  by: 'ip' | 'user';
}

const RATE_LIMIT_POLICY = 'rateLimitPolicy';

/** Declares the rate-limit policy of a route; enforced by RateLimitGuard. */
export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_POLICY, policy);

/** Runs after authentication and before idempotency handling (contract check order #1). */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.get<RateLimitPolicy>(RATE_LIMIT_POLICY, context.getHandler());
    if (!policy) return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const subject = policy.by === 'user' ? req.user?.id : req.ip;
    const key = `${policy.name}:${subject ?? 'anonymous'}`;
    const decision = await this.limiter.hit(key, policy.limit, policy.windowSeconds * 1000);
    if (!decision.allowed) throw Errors.rateLimited(decision.retryAfterSeconds);
    return true;
  }
}
