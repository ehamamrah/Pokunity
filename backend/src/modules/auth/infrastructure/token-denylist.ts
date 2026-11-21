import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../shared/redis/redis.service';

export type DenylistStatus = 'active' | 'revoked' | 'unknown';

const keyOf = (jti: string) => `auth:revoked:${jti}`;

/**
 * Revoked access-token ids in Redis, each kept exactly as long as the token could still be used
 * (TTL = remaining lifetime), so the set never grows beyond the live tokens. Every access goes through
 * the Redis circuit breaker; `unknown` means Redis could not answer.
 */
@Injectable()
export class TokenDenylist {
  constructor(private readonly redis: RedisService) {}

  async status(jti: string | null): Promise<DenylistStatus> {
    if (!jti) return 'active';
    const exists = await this.redis.guard((r) => r.exists(keyOf(jti)), () => null);
    if (exists === null) return 'unknown';
    return exists === 1 ? 'revoked' : 'active';
  }

  /** false = could not be stored (Redis unavailable); the caller must fall back. */
  async revoke(jti: string, expiresAtEpochSeconds: number): Promise<boolean> {
    const ttl = Math.max(1, expiresAtEpochSeconds - Math.floor(Date.now() / 1000));
    const result = await this.redis.guard((r) => r.set(keyOf(jti), '1', 'EX', ttl), () => null);
    return result === 'OK';
  }
}
