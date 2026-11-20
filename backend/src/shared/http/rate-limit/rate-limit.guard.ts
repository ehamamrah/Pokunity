import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Errors } from '../../errors/app-error';
import { AuthenticatedRequest } from '../current-user.decorator';
import { RateLimitPolicy, RateLimitSubject } from './policies';
import { RateLimitDecision, RateLimitService } from './rate-limit.service';

const RATE_LIMIT_POLICIES = 'rateLimitPolicies';

/** Declares one or more rate-limit policies on a route; all must pass. */
export const RateLimit = (...policies: RateLimitPolicy[]) => SetMetadata(RATE_LIMIT_POLICIES, policies);

type Req = Request & AuthenticatedRequest;

/**
 * Runs after authentication and before idempotency handling (contract check order #1). Sets
 * `RateLimit-Limit/Remaining/Reset` (most constraining policy) and `Retry-After` on 429.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policies = this.reflector.get<RateLimitPolicy[]>(RATE_LIMIT_POLICIES, context.getHandler()) ?? [];
    if (policies.length === 0) return true;
    const req = context.switchToHttp().getRequest<Req>();
    const decisions = await Promise.all(policies.map((p) => this.limiter.hit(keyOf(p, req), p.limit, p.windowSeconds * 1000)));
    const tightest = decisions.reduce((a, b) => (!b.allowed || b.remaining < a.remaining ? b : a));
    setRateLimitHeaders(context.switchToHttp().getResponse<Response>(), tightest);
    if (!tightest.allowed) throw Errors.rateLimited(tightest.resetSeconds);
    return true;
  }
}

const subjects: Record<RateLimitSubject, (req: Req) => string | undefined> = {
  ip: (req) => req.ip,
  user: (req) => req.user?.id,
  email: (req) => (typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : undefined),
};

function keyOf(policy: RateLimitPolicy, req: Req): string {
  return `${policy.name}:${subjects[policy.by](req) ?? 'anonymous'}`;
}

export function setRateLimitHeaders(res: Response, d: RateLimitDecision): void {
  res.setHeader('RateLimit-Limit', String(d.limit));
  res.setHeader('RateLimit-Remaining', String(d.remaining));
  res.setHeader('RateLimit-Reset', String(d.resetSeconds));
}
