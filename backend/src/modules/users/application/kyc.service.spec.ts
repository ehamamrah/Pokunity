import { AppConfig } from '../../../shared/config/app-config';
import { BreakerRegistry } from '../../../shared/resilience/breaker-registry';
import { Env } from '../../../shared/config/env.schema';
import { FixedClock } from '../../../shared/clock/clock';
import { ProviderKycStatus } from '../domain/user.types';
import { CachedKyc, KycCache } from '../infrastructure/kyc-cache';
import { KycProvider } from '../kyc-provider.port';
import { KycService } from './kyc.service';

const env = { KYC_TIMEOUT_MS: 50, KYC_FRESH_TTL_SECONDS: 600, KYC_BREAKER_FAILURE_THRESHOLD: 5, KYC_BREAKER_OPEN_MS: 1000 } as Env;

class MemoryCache {
  entries = new Map<string, CachedKyc>();
  negative = new Set<string>();
  async get(id: string) { return this.entries.get(id) ?? null; }
  isFresh(e: CachedKyc, now: Date) { return now.getTime() - Date.parse(e.checkedAt) < 600_000; }
  async put(id: string, e: CachedKyc) { this.entries.set(id, e); }
  async markUnavailable(id: string) { this.negative.add(id); }
  async isMarkedUnavailable(id: string) { return this.negative.has(id); }
}

function setup(fetchStatus: () => Promise<ProviderKycStatus>) {
  const clock = new FixedClock(new Date('2026-11-21T10:00:00.000Z'));
  const cache = new MemoryCache();
  const provider = { fetchStatus: jest.fn(fetchStatus) } as unknown as KycProvider & { fetchStatus: jest.Mock };
  const service = new KycService(provider, cache as unknown as KycCache, clock, new AppConfig(env), new BreakerRegistry());
  return { service, cache, provider, clock };
}

test('fresh cache is served without calling the provider', async () => {
  const { service, cache, provider } = setup(async () => 'VERIFIED');
  await cache.put('u1', { status: 'VERIFIED', checkedAt: '2026-11-21T09:58:00.000Z' });
  await expect(service.getStatus('u1')).resolves.toMatchObject({ status: 'VERIFIED', stale: false });
  expect(provider.fetchStatus).not.toHaveBeenCalled();
});

test('provider result is cached', async () => {
  const { service, cache } = setup(async () => 'PENDING');
  await expect(service.getStatus('u1')).resolves.toMatchObject({ status: 'PENDING' });
  expect(cache.entries.get('u1')?.status).toBe('PENDING');
});

test('stale cache is served when the provider times out (stale-if-error)', async () => {
  const { service, cache } = setup(() => new Promise(() => undefined));
  await cache.put('u1', { status: 'VERIFIED', checkedAt: '2026-11-20T12:00:00.000Z' });
  await expect(service.getStatus('u1')).resolves.toEqual({ status: 'VERIFIED', checkedAt: '2026-11-20T12:00:00.000Z', stale: true });
});

test('no cache and provider down => UNKNOWN, then negative-cached (no hammering)', async () => {
  const { service, provider } = setup(() => Promise.reject(new Error('down')));
  await expect(service.getStatus('u1')).resolves.toMatchObject({ status: 'UNKNOWN', checkedAt: null });
  await expect(service.getStatus('u1')).resolves.toMatchObject({ status: 'UNKNOWN' });
  expect(provider.fetchStatus).toHaveBeenCalledTimes(1);
});

test('concurrent lookups for one member share a single provider call', async () => {
  const { service, provider } = setup(async () => 'VERIFIED');
  await Promise.all([service.getStatus('u1'), service.getStatus('u1'), service.getStatus('u1')]);
  expect(provider.fetchStatus).toHaveBeenCalledTimes(1);
});

test('read pages get a stale status immediately while it refreshes in the background', async () => {
  const { service, cache, provider } = setup(async () => 'REJECTED');
  await cache.put('u1', { status: 'VERIFIED', checkedAt: '2026-11-21T09:00:00.000Z' });
  await expect(service.getStatus('u1', { allowStale: true })).resolves.toMatchObject({ status: 'VERIFIED', stale: true });
  await new Promise((resolve) => setImmediate(resolve));
  expect(provider.fetchStatus).toHaveBeenCalledTimes(1);
  await expect(service.getStatus('u1')).resolves.toMatchObject({ status: 'REJECTED', stale: false });
});

test('provider health degrades once the breaker opens', async () => {
  const { service } = setup(() => Promise.reject(new Error('down')));
  for (let i = 0; i < 5; i += 1) await service.getStatus(`user-${i}`);
  expect(service.providerHealth).toBe('degraded');
});
