import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config/app-config';

/**
 * Redis is an accelerator (caches, rate limits, fast-fail gate), never a source of truth.
 * Commands time out quickly so that callers can degrade gracefully when Redis is unhealthy.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(config: AppConfig) {
    this.client = new Redis(config.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      commandTimeout: 500,
      enableOfflineQueue: true,
    });
    this.client.on('error', (e: Error) => this.logger.warn(`redis error: ${e.message}`));
  }

  async ping(): Promise<boolean> {
    return this.client.ping().then((r) => r === 'PONG', () => false);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
