export type PaymentStatus = 'AUTHORIZING' | 'AUTHORIZED' | 'CAPTURED' | 'VOIDED' | 'FAILED';
export type ProviderEventType = 'payment.authorized' | 'payment.failed' | 'payment.captured' | 'payment.voided';
export type EventOutcome = 'PROCESSED' | 'IGNORED' | 'ORPHAN' | 'ORPHAN_RESOLVED';

export interface PaymentSummary {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: 'SAR';
}

export interface PaymentRecord extends PaymentSummary {
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
