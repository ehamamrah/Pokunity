import { Global, Module } from '@nestjs/common';
import { AppConfig } from './config/app-config';
import { loadEnv } from './config/env.schema';
import { Clock, SystemClock } from './clock/clock';
import { Database } from './database/database.service';
import { RedisService } from './redis/redis.service';
import { RateLimitService } from './http/rate-limit.service';
import { RateLimitGuard } from './http/rate-limit.guard';
import { JobRunner } from './jobs/job-runner';

/** Cross-cutting infrastructure available to every module (no business logic here). */
@Global()
@Module({
  providers: [
    { provide: AppConfig, useFactory: () => new AppConfig(loadEnv()) },
    { provide: Clock, useClass: SystemClock },
    Database,
    RedisService,
    RateLimitService,
    RateLimitGuard,
    JobRunner,
  ],
  exports: [AppConfig, Clock, Database, RedisService, RateLimitService, RateLimitGuard, JobRunner],
})
export class SharedModule {}
