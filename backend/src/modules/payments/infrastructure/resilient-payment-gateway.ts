import { CircuitBreaker } from '../../../shared/resilience/circuit-breaker';
import { withTimeout } from '../../../shared/utils/timeout';
import { AuthorizeRequest, IntentView, PaymentGateway } from '../payment-gateway.port';

/**
 * Decorator around any PaymentGateway adapter: every provider call gets a timeout and goes through
 * the `paymentGateway` circuit breaker. When the circuit is open, calls fail fast; callers are
 * outbox/reconciliation jobs, which simply retry later, so members are never failed by an outage.
 */
export class ResilientPaymentGateway extends PaymentGateway {
  constructor(
    private readonly inner: PaymentGateway,
    private readonly breaker: CircuitBreaker,
    private readonly timeoutMs = 5000,
  ) {
    super();
  }

  authorize(request: AuthorizeRequest): Promise<{ intentId: string }> {
    return this.call(() => this.inner.authorize(request));
  }

  capture(intentId: string, idempotencyKey: string): Promise<void> {
    return this.call(() => this.inner.capture(intentId, idempotencyKey));
  }

  void(intentId: string, idempotencyKey: string): Promise<void> {
    return this.call(() => this.inner.void(intentId, idempotencyKey));
  }

  getIntent(lookup: { intentId: string | null; reference: string }): Promise<IntentView | null> {
    return this.call(() => this.inner.getIntent(lookup));
  }

  private call<T>(operation: () => Promise<T>): Promise<T> {
    return this.breaker.execute(() => withTimeout(operation(), this.timeoutMs));
  }
}
