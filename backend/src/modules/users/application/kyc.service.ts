import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../shared/config/app-config';
import { Clock } from '../../../shared/clock/clock';
import { BreakerRegistry } from '../../../shared/resilience/breaker-registry';
import { CircuitBreaker } from '../../../shared/resilience/circuit-breaker';
import { withTimeout } from '../../../shared/utils/timeout';
import { KycView } from '../domain/user.types';
import { CachedKyc, KycCache } from '../infrastructure/kyc-cache';
import { KycProvider } from '../kyc-provider.port';

const UNKNOWN: KycView = { status: 'UNKNOWN', checkedAt: null, stale: false };

/**
 * Resolves a member's KYC status: fresh cache → provider (timeout + circuit breaker, single-flight
 * per user) → stale cache on error → UNKNOWN. Booking fails closed on UNKNOWN (regulated).
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly breaker: CircuitBreaker;
  private readonly inFlight = new Map<string, Promise<KycView>>();

  constructor(
    private readonly provider: KycProvider,
    private readonly cache: KycCache,
    private readonly clock: Clock,
    private readonly config: AppConfig,
    breakers: BreakerRegistry,
  ) {
    this.breaker = breakers.get('kyc', {
      failureThreshold: config.env.KYC_BREAKER_FAILURE_THRESHOLD,
      openDurationMs: config.env.KYC_BREAKER_OPEN_MS,
    });
  }

  get providerHealth(): 'up' | 'degraded' {
    return this.breaker.state === 'CLOSED' ? 'up' : 'degraded';
  }

  /**
   * `allowStale` (read pages only): a cached-but-not-fresh status is returned immediately and refreshed
   * in the background (stale-while-revalidate), so a cache expiry wave never lands on request latency.
   * The booking path never sets it: it always waits for a fresh answer (or the stale-if-error rules).
   */
  async getStatus(userId: string, options: { allowStale?: boolean } = {}): Promise<KycView> {
    const cached = await this.cache.get(userId);
    if (cached && this.cache.isFresh(cached, this.clock.now())) return toView(cached, false);
    const pending = this.refreshOnce(userId, cached);
    if (cached && options.allowStale) {
      pending.catch(() => undefined);
      return toView(cached, true);
    }
    return pending;
  }

  private refreshOnce(userId: string, cached: CachedKyc | null): Promise<KycView> {
    const running = this.inFlight.get(userId);
    if (running) return running;
    const pending = this.refresh(userId, cached).finally(() => this.inFlight.delete(userId));
    this.inFlight.set(userId, pending);
    return pending;
  }

  private async refresh(userId: string, cached: CachedKyc | null): Promise<KycView> {
    if (!cached && (await this.cache.isMarkedUnavailable(userId))) return UNKNOWN;
    try {
      const timeoutMs = this.config.env.KYC_TIMEOUT_MS;
      const status = await this.breaker.execute(() => withTimeout(this.provider.fetchStatus(userId), timeoutMs));
      const entry = { status, checkedAt: this.clock.now().toISOString() };
      await this.cache.put(userId, entry);
      return toView(entry, false);
    } catch (error) {
      return this.onProviderFailure(userId, cached, error);
    }
  }

  private async onProviderFailure(userId: string, cached: CachedKyc | null, error: unknown): Promise<KycView> {
    this.logger.warn({ msg: 'kyc lookup failed', userId, servedStale: !!cached, error: String(error) });
    if (cached) return toView(cached, true);
    await this.cache.markUnavailable(userId);
    return UNKNOWN;
  }
}

function toView(entry: CachedKyc, stale: boolean): KycView {
  return { status: entry.status, checkedAt: entry.checkedAt, stale };
}
