import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { decision, LocalRateLimiter } from './local-rate-limiter';

/**
 * Sliding-window counter, atomic in Redis (one Lua call, Redis clock):
 *   estimate = previousWindowCount × (1 − elapsedFraction) + currentWindowCount
 * Rejected attempts are not counted, so a client that backs off recovers on schedule.
 */
const SLIDING_WINDOW = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local current = math.floor(now / window)
local curKey = KEYS[1] .. ':' .. current
local prev = tonumber(redis.call('GET', KEYS[1] .. ':' .. (current - 1)) or '0')
local count = tonumber(redis.call('GET', curKey) or '0')
local elapsed = (now % window) / window
local estimate = math.floor(prev * (1 - elapsed) + count)
local resetMs = window - (now % window)
if estimate >= limit then return { 0, estimate, resetMs } end
redis.call('INCR', curKey)
redis.call('PEXPIRE', curKey, window * 2)
return { 1, estimate + 1, resetMs }`;

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

@Injectable()
export class RateLimitService {
  private readonly local = new LocalRateLimiter();

  constructor(private readonly redis: RedisService) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const result = await this.redis.guard(
      (r) => r.eval(SLIDING_WINDOW, 1, `rl:${key}`, windowMs, limit) as Promise<[number, number, number]>,
      () => null,
    );
    if (!result) return this.local.hit(key, limit, windowMs);
    const [allowed, used, resetMs] = result;
    return decision(allowed === 1, limit, used, resetMs);
  }
}
