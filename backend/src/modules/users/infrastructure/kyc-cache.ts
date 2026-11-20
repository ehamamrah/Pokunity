import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../shared/config/app-config';
import { RedisService } from '../../../shared/redis/redis.service';
import { ProviderKycStatus } from '../domain/user.types';

export interface CachedKyc {
  status: ProviderKycStatus;
  checkedAt: string;
}

/**
 * KYC result cache. Entries live for KYC_STALE_TTL_SECONDS (24h) so they can be served when the
 * provider fails (stale-if-error); they count as *fresh* for KYC_FRESH_TTL_SECONDS (10 min).
 * A short negative marker prevents hammering a failing provider for users with no cache.
 * Redis failures degrade to "no cache" (never throw).
 */
@Injectable()
export class KycCache {
  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {}

  async get(userId: string): Promise<CachedKyc | null> {
    const raw = await this.redis.guard((r) => r.get(`kyc:${userId}`), () => null);
    return raw ? (JSON.parse(raw) as CachedKyc) : null;
  }

  isFresh(entry: CachedKyc, now: Date): boolean {
    const ageMs = now.getTime() - new Date(entry.checkedAt).getTime();
    return ageMs < this.config.env.KYC_FRESH_TTL_SECONDS * 1000;
  }

  async put(userId: string, entry: CachedKyc): Promise<void> {
    const ttl = this.config.env.KYC_STALE_TTL_SECONDS;
    await this.redis.guard((r) => r.set(`kyc:${userId}`, JSON.stringify(entry), 'EX', ttl), () => null);
  }

  async markUnavailable(userId: string): Promise<void> {
    const ttl = this.config.env.KYC_NEGATIVE_TTL_SECONDS;
    await this.redis.guard((r) => r.set(`kyc:neg:${userId}`, '1', 'EX', ttl), () => null);
  }

  async isMarkedUnavailable(userId: string): Promise<boolean> {
    return (await this.redis.guard((r) => r.exists(`kyc:neg:${userId}`), () => 0)) === 1;
  }
}
