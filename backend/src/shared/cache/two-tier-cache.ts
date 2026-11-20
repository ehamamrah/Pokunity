import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface CachePolicy {
  key: string;
  /** In-process TTL (0 = skip L1). */
  l1Ms: number;
  /** Redis TTL shared by all instances. */
  l2Ms: number;
  /** How long one instance may hold the refresh lock. */
  lockMs?: number;
}

const jitter = (ms: number, spread = 0.1) => Math.round(ms * (1 - spread + Math.random() * 2 * spread));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Two-tier read-through cache:
 *   L1 (process memory, ~1 s) → L2 (Redis, a few seconds, shared) → loader (PostgreSQL).
 * Stampede protection: in-process single-flight per key, plus a Redis refresh lock so that one
 * instance loads while the others wait briefly for its result. TTLs are jittered to avoid
 * synchronised expiry. Redis problems (breaker open) degrade to "load from the database".
 */
@Injectable()
export class TwoTierCache {
  private readonly l1 = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly flights = new Map<string, Promise<unknown>>();

  constructor(private readonly redis: RedisService) {}

  async get<T>(policy: CachePolicy, loader: () => Promise<T>): Promise<T> {
    const hit = this.l1.get(policy.key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    return this.coalesce(policy.key, () => this.fromL2OrLoad(policy, loader));
  }

  async invalidate(key: string): Promise<void> {
    this.l1.delete(key);
    await this.redis.guard((r) => r.del(key), () => 0);
  }

  private coalesce<T>(key: string, work: () => Promise<T>): Promise<T> {
    const running = this.flights.get(key) as Promise<T> | undefined;
    if (running) return running;
    const flight = work().finally(() => this.flights.delete(key));
    this.flights.set(key, flight);
    return flight;
  }

  private async fromL2OrLoad<T>(policy: CachePolicy, loader: () => Promise<T>): Promise<T> {
    const cached = await this.readL2<T>(policy.key);
    const value = cached !== undefined ? cached : await this.loadWithLock(policy, loader);
    if (policy.l1Ms > 0) this.l1.set(policy.key, { value, expiresAt: Date.now() + jitter(policy.l1Ms, 0.2) });
    return value;
  }

  private async loadWithLock<T>(policy: CachePolicy, loader: () => Promise<T>): Promise<T> {
    const lockMs = policy.lockMs ?? 2000;
    const lock = await this.redis.guard((r) => r.set(`${policy.key}:lock`, '1', 'PX', lockMs, 'NX'), () => 'OK');
    if (lock !== 'OK') {
      const loadedElsewhere = await this.waitForL2<T>(policy.key);
      if (loadedElsewhere !== undefined) return loadedElsewhere;
    }
    const value = await loader();
    const payload = JSON.stringify(value);
    await this.redis.guard((r) => r.set(policy.key, payload, 'PX', jitter(policy.l2Ms)), () => null);
    return value;
  }

  private async waitForL2<T>(key: string): Promise<T | undefined> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sleep(30);
      const value = await this.readL2<T>(key);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  private async readL2<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.guard((r) => r.get(key), () => null);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }
}
