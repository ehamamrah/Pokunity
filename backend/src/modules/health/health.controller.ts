import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { Database } from '../../shared/database/database.service';
import { Public } from '../../shared/http/public.decorator';
import { RedisService } from '../../shared/redis/redis.service';
import { BreakerRegistry } from '../../shared/resilience/breaker-registry';
import { UsersFacade } from '../users/users.facade';

/** Liveness + dependency health. Breaker degradation (KYC, payment gateway, Redis) never fails the probe. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: Database,
    private readonly redis: RedisService,
    private readonly users: UsersFacade,
    private readonly breakers: BreakerRegistry,
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  async health(@Res({ passthrough: true }) res: Response) {
    const [db, redis] = await Promise.all([this.db.ping(), this.redis.ping()]);
    const healthy = db && redis;
    res.status(healthy ? 200 : 503);
    const checks = { database: db ? 'up' : 'down', redis: redis ? 'up' : 'down', kyc: this.users.kycHealth() };
    // `breakers` is an additive field (contract-compatible): CLOSED | OPEN | HALF_OPEN per dependency.
    return { status: healthy ? 'ok' : 'error', checks, breakers: this.breakers.states(), time: new Date().toISOString() };
  }
}
