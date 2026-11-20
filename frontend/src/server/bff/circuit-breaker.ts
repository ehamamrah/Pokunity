export type BreakerPhase = 'closed' | 'open' | 'half-open';

export interface BreakerOptions {
  /** Consecutive failures that trip the circuit. */
  failureThreshold: number;
  /** How long the circuit stays open before a single probe is allowed. */
  openMs: number;
  now?: () => number;
}

/**
 * Fail-fast guard in front of the backend. Closed: requests flow and failures are counted.
 * Open: requests fail immediately for `openMs`. Half-open: exactly one probe is admitted;
 * its success closes the circuit and its failure reopens it.
 */
export class CircuitBreaker {
  private phase: BreakerPhase = 'closed';
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;
  private readonly now: () => number;

  constructor(private readonly options: BreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  state(): BreakerPhase {
    return this.phase;
  }

  /** Call before each request. False means "fail fast, do not call the backend". */
  acquire(): boolean {
    if (this.phase === 'closed') return true;
    if (this.phase === 'open') {
      if (this.now() - this.openedAt < this.options.openMs) return false;
      this.phase = 'half-open';
    }
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  /** Call once per admitted request with its outcome. */
  record(success: boolean): void {
    if (success) {
      this.onSuccess();
      return;
    }
    this.onFailure();
  }

  retryAfterSeconds(): number {
    return Math.max(1, Math.ceil((this.openedAt + this.options.openMs - this.now()) / 1000));
  }

  private onSuccess(): void {
    if (this.phase === 'half-open') {
      this.phase = 'closed';
      this.probeInFlight = false;
    }
    if (this.phase === 'closed') this.failures = 0;
  }

  private onFailure(): void {
    if (this.phase === 'half-open') return this.trip();
    if (this.phase === 'open') return undefined;
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) this.trip();
    return undefined;
  }

  private trip(): void {
    this.phase = 'open';
    this.openedAt = this.now();
    this.failures = 0;
    this.probeInFlight = false;
  }
}
