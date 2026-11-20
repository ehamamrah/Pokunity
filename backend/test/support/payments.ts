import { randomUUID } from 'node:crypto';
import { Harness } from './harness';

export interface PaymentRow {
  id: string;
  status: string;
  provider_intent_id: string;
  amount: number;
}

export async function paymentOf(h: Harness, reservationId: string): Promise<PaymentRow> {
  const { rows } = await h.db.query<PaymentRow>('SELECT * FROM payments WHERE reservation_id = $1', [reservationId]);
  return rows[0];
}

export async function ledgerOf(h: Harness, paymentId: string): Promise<string[]> {
  const { rows } = await h.db.query<{ entry_type: string }>('SELECT entry_type FROM ledger_entries WHERE payment_id = $1 ORDER BY id', [paymentId]);
  return rows.map((r) => r.entry_type);
}

export async function seatStatus(h: Harness, jameyaId: string, seatNumber: number): Promise<string> {
  const { rows } = await h.db.query<{ status: string }>('SELECT status FROM seats WHERE jameya_id = $1 AND seat_number = $2', [jameyaId, seatNumber]);
  return rows[0].status;
}

export function providerEvent(type: string, p: PaymentRow, eventId = `evt_${randomUUID()}`) {
  return {
    eventId, type, paymentIntentId: p.provider_intent_id, amount: p.amount, currency: 'SAR',
    occurredAt: new Date().toISOString(), failureCode: type === 'payment.failed' ? 'INSUFFICIENT_FUNDS' : null,
  };
}

/** Moves a payment's creation time into the past (simulates elapsed time for reconciliation). */
export async function agePayment(h: Harness, paymentId: string, seconds: number): Promise<void> {
  await h.db.query(`UPDATE payments SET created_at = now() - make_interval(secs => $2) WHERE id = $1`, [paymentId, seconds]);
}

/** Puts the simulated provider in the state a real `payment.authorized` webhook implies. */
export async function providerAuthorizes(h: Harness, p: PaymentRow): Promise<void> {
  await h.db.query(`UPDATE simulator_payment_intents SET status = 'AUTHORIZED' WHERE id = $1 AND status = 'PENDING'`, [p.provider_intent_id]);
}
