import { Global, Module } from '@nestjs/common';
import { AppConfig } from './config/app-config';
import { loadEnv } from './config/env.schema';
import { Clock, SystemClock } from './clock/clock';
import { Database } from './database/database.service';
import { RedisService } from './redis/redis.service';
import { RateLimitService } from './http/rate-limit/rate-limit.service';
import { RateLimitGuard } from './http/rate-limit/rate-limit.guard';
import { GlobalRateLimitMiddleware } from './http/rate-limit/global-rate-limit.middleware';
import { JobRunner } from './jobs/job-runner';
import { BreakerRegistry } from './resilience/breaker-registry';
import { TwoTierCache } from './cache/two-tier-cache';

/** Cross-cutting infrastructure available to every module (no business logic here). */
@Global()
@Module({
  providers: [
    { provide: AppConfig, useFactory: () => new AppConfig(loadEnv()) },
    { provide: Clock, useClass: SystemClock },
    BreakerRegistry,
    TwoTierCache,
    Database,
    RedisService,
    RateLimitService,
    RateLimitGuard,
    GlobalRateLimitMiddleware,
    JobRunner,
  ],
  exports: [AppConfig, Clock, BreakerRegistry, TwoTierCache, Database, RedisService, RateLimitService, RateLimitGuard, GlobalRateLimitMiddleware, JobRunner],
})
export class SharedModule {}
