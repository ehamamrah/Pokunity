import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

// Atomic fixed-window counter: INCR + set expiry on first hit, return count and remaining TTL.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }`;

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Redis-backed limiter shared by all instances. Fails open if Redis is unavailable. */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    try {
      const [count, ttl] = (await this.redis.client.eval(HIT_SCRIPT, 1, `rl:${key}`, windowMs)) as [
        number,
        number,
      ];
      return { allowed: count <= limit, retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1000)) };
    } catch (error) {
      this.logger.warn({ msg: 'rate limiter unavailable, failing open', key, error: String(error) });
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
}
