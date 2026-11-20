import { Injectable } from '@nestjs/common';
import { BreakerOptions, BreakerState, CircuitBreaker } from './circuit-breaker';

/**
 * Named circuit breakers shared by the process (KYC, payment gateway, Redis). One place to
 * create them and to report their state (/health `breakers`).
 */
@Injectable()
export class BreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  get(name: string, options: BreakerOptions): CircuitBreaker {
    const existing = this.breakers.get(name);
    if (existing) return existing;
    const breaker = new CircuitBreaker(options);
    this.breakers.set(name, breaker);
    return breaker;
  }

  states(): Record<string, BreakerState> {
    return Object.fromEntries([...this.breakers].map(([name, b]) => [name, b.state]));
  }
}
