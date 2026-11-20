import { RedisService } from '../redis/redis.service';
import { LruCache } from './lru';
import { TwoTierCache } from './two-tier-cache';

/** Fake RedisService: `guard` runs against an in-memory map, or always falls back when "down". */
function fakeRedis(store = new Map<string, string>(), down = false): RedisService {
  const client = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string, ..._rest: unknown[]) => (k.endsWith(':lock') && store.has(k) ? null : (store.set(k, v), 'OK')),
    del: async (k: string) => Number(store.delete(k)),
  };
  const guard = async <T>(op: (c: typeof client) => Promise<T>, fallback: () => T) => (down ? fallback() : op(client));
  return { guard } as unknown as RedisService;
}

const policy = { key: 'k', l1Ms: 1000, l2Ms: 3000 };

test('concurrent misses are coalesced into one load (single-flight)', async () => {
  const cache = new TwoTierCache(fakeRedis());
  const loader = jest.fn(async () => ({ v: 1 }));
  const results = await Promise.all(Array.from({ length: 20 }, () => cache.get(policy, loader)));
  expect(loader).toHaveBeenCalledTimes(1);
  expect(new Set(results).size).toBe(1);
});

test('a second instance is served from L2 without touching the loader', async () => {
  const store = new Map<string, string>();
  await new TwoTierCache(fakeRedis(store)).get(policy, async () => ({ v: 'from-db' }));
  const loader = jest.fn(async () => ({ v: 'again' }));
  await expect(new TwoTierCache(fakeRedis(store)).get(policy, loader)).resolves.toEqual({ v: 'from-db' });
  expect(loader).not.toHaveBeenCalled();
});

test('with Redis down the cache degrades to the loader (fail open to the database)', async () => {
  const cache = new TwoTierCache(fakeRedis(new Map(), true));
  await expect(cache.get({ ...policy, l1Ms: 0 }, async () => 42)).resolves.toBe(42);
});

test('invalidate drops L1 and L2', async () => {
  const store = new Map<string, string>();
  const cache = new TwoTierCache(fakeRedis(store));
  await cache.get(policy, async () => 1);
  await cache.invalidate('k');
  await expect(cache.get(policy, async () => 2)).resolves.toBe(2);
});

test('LRU evicts the least recently used entry', () => {
  const lru = new LruCache<string, number>(2);
  lru.set('a', 1);
  lru.set('b', 2);
  lru.get('a');
  lru.set('c', 3);
  expect([lru.get('a'), lru.get('b'), lru.get('c')]).toEqual([1, undefined, 3]);
});
