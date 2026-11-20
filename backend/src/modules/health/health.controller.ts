import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { Database } from '../../shared/database/database.service';
import { Public } from '../../shared/http/public.decorator';
import { RedisService } from '../../shared/redis/redis.service';
import { UsersFacade } from '../users/users.facade';

/** Liveness + dependency health. KYC degradation (breaker open) never makes the service unhealthy. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: Database,
    private readonly redis: RedisService,
    private readonly users: UsersFacade,
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  async health(@Res({ passthrough: true }) res: Response) {
    const [db, redis] = await Promise.all([this.db.ping(), this.redis.ping()]);
    const healthy = db && redis;
    res.status(healthy ? 200 : 503);
    const checks = { database: db ? 'up' : 'down', redis: redis ? 'up' : 'down', kyc: this.users.kycHealth() };
    return { status: healthy ? 'ok' : 'error', checks, time: new Date().toISOString() };
  }
}
