export type PaymentStatus = 'AUTHORIZING' | 'AUTHORIZED' | 'CAPTURED' | 'VOIDED' | 'FAILED';
export type ProviderEventType = 'payment.authorized' | 'payment.failed' | 'payment.captured' | 'payment.voided';
export type EventOutcome = 'PROCESSED' | 'IGNORED' | 'ORPHAN' | 'ORPHAN_RESOLVED';

export interface PaymentSummary {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: 'SAR';
  /** v1.1: reconciliation deadline while AUTHORIZING (createdAt + PAYMENT_TIMEOUT_SECONDS); else null. */
  resolveBy: string | null;
}

export interface PaymentRecord extends Omit<PaymentSummary, 'resolveBy'> {
  reservationId: string;
  userId: string;
  providerIntentId: string | null;
  createdAt: Date;
}

export interface ProviderEvent {
  eventId: string;
  type: ProviderEventType;
  paymentIntentId: string;
  amount: number;
  currency: string;
  occurredAt: string;
  failureCode?: string | null;
}
