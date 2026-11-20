export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerOptions {
  failureThreshold: number;
  openDurationMs: number;
  now?: () => number;
}

export class CircuitOpenError extends Error {
  constructor() {
    super('circuit open');
  }
}

/**
 * Circuit Breaker: after `failureThreshold` consecutive failures the circuit OPENs and calls
 * fail fast; after `openDurationMs` a single HALF_OPEN probe decides whether to close again.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;
  private readonly now: () => number;

  constructor(private readonly options: BreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  get state(): BreakerState {
    if (this.failures < this.options.failureThreshold) return 'CLOSED';
    return this.now() - this.openedAt >= this.options.openDurationMs ? 'HALF_OPEN' : 'OPEN';
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.state;
    if (state === 'OPEN' || (state === 'HALF_OPEN' && this.probeInFlight)) throw new CircuitOpenError();
    this.probeInFlight = state === 'HALF_OPEN';
    try {
      const result = await operation();
      this.failures = 0;
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    } finally {
      this.probeInFlight = false;
    }
  }

  private recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) this.openedAt = this.now();
  }
}
