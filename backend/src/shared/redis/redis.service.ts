import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config/app-config';
import { BreakerRegistry } from '../resilience/breaker-registry';
import { CircuitBreaker } from '../resilience/circuit-breaker';

/**
 * Redis is an accelerator (caches, rate limits, fast-fail gate), never a source of truth.
 * `guard()` wraps every optional Redis use in a circuit breaker: after 3 consecutive failures,
 * callers get their fallback immediately for 5 s instead of waiting for command timeouts.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly breaker: CircuitBreaker;
  private readonly logger = new Logger(RedisService.name);

  constructor(config: AppConfig, breakers: BreakerRegistry) {
    this.client = new Redis(config.env.REDIS_URL, { maxRetriesPerRequest: 1, commandTimeout: 500, enableOfflineQueue: true });
    this.client.on('error', (e: Error) => this.logger.warn(`redis error: ${e.message}`));
    this.breaker = breakers.get('redis', { failureThreshold: 3, openDurationMs: 5000 });
  }

  /** Runs `op` through the breaker; any failure (or open circuit) yields `fallback`. */
  async guard<T>(op: (client: Redis) => Promise<T>, fallback: () => T): Promise<T> {
    try {
      return await this.breaker.execute(() => op(this.client));
    } catch {
      return fallback();
    }
  }

  async ping(): Promise<boolean> {
    return this.client.ping().then((r) => r === 'PONG', () => false);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
