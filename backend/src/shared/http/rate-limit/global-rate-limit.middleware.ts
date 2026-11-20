import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AppConfig } from '../../config/app-config';
import { Errors } from '../../errors/app-error';
import { HttpExceptionFilter } from '../../errors/http-exception.filter';
import { setRateLimitHeaders } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

const EXEMPT = ['/api/v1/health', '/api/v1/payments/webhook'];

/**
 * Global per-client-IP ceiling, applied before authentication so floods are shed cheaply.
 * Behind a proxy the client IP comes from X-Forwarded-For (`trust proxy` = private ranges only).
 */
@Injectable()
export class GlobalRateLimitMiddleware implements NestMiddleware {
  private readonly filter = new HttpExceptionFilter();

  constructor(
    private readonly limiter: RateLimitService,
    private readonly config: AppConfig,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (EXEMPT.some((path) => req.originalUrl.startsWith(path))) return next();
    const limit = this.config.env.RATE_LIMIT_IP_PER_10S;
    const decision = await this.limiter.hit(`global-ip:${req.ip}`, limit, 10_000);
    if (decision.allowed) return next();
    setRateLimitHeaders(res, decision);
    const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) };
    this.filter.catch(Errors.rateLimited(decision.resetSeconds), host as never);
  }
}
