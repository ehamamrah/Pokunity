import { Injectable } from '@nestjs/common';
import { UsersFacade } from '../../users/users.facade';

export const SESSION_VERSION_TTL_MS = 5000;

/**
 * Per-instance L1 cache of members' token versions (PostgreSQL is the source of truth), so the auth
 * guard does not hit the database on every request. Enforced even when Redis is down. Trade-off: a
 * "log out everywhere" reaches OTHER instances within ≤ 5 s (immediately on the instance that served it).
 */
@Injectable()
export class SessionVersionCache {
  private readonly entries = new Map<string, { version: number | null; expiresAt: number }>();

  constructor(private readonly users: UsersFacade) {}

  async versionOf(userId: string): Promise<number | null> {
    const hit = this.entries.get(userId);
    if (hit && hit.expiresAt > Date.now()) return hit.version;
    const version = await this.users.tokenVersionOf(userId);
    this.remember(userId, version);
    return version;
  }

  remember(userId: string, version: number | null): void {
    if (this.entries.size > 100_000) this.entries.clear();
    this.entries.set(userId, { version, expiresAt: Date.now() + SESSION_VERSION_TTL_MS });
  }
}
