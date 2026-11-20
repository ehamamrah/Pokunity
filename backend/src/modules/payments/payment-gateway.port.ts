export type IntentStatus = 'PENDING' | 'AUTHORIZED' | 'FAILED' | 'CAPTURED' | 'VOIDED';

export interface AuthorizeRequest {
  /** Our payment id; the provider de-duplicates authorizations on it (idempotency key). */
  reference: string;
  amount: number;
  currency: string;
  token: string;
}

export interface IntentView {
  intentId: string;
  status: IntentStatus;
}

/**
 * Port for the payment service provider (authorize → capture | void). Only authorization holds
 * funds; capture happens strictly after the seat is confirmed. Implementations must be idempotent.
 */
export abstract class PaymentGateway {
  abstract authorize(request: AuthorizeRequest): Promise<{ intentId: string }>;
  abstract capture(intentId: string, idempotencyKey: string): Promise<void>;
  abstract void(intentId: string, idempotencyKey: string): Promise<void>;
  abstract getIntent(lookup: { intentId: string | null; reference: string }): Promise<IntentView | null>;
}
