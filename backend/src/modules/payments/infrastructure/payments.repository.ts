import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { SqlExecutor } from '../../../shared/database/sql-executor';
import { paymentSourcesOf } from '../domain/payment-state-machine';
import { PaymentRecord, PaymentStatus, PaymentSummary } from '../domain/payment.types';

interface PaymentRow {
  id: string;
  reservation_id: string;
  user_id: string;
  amount: number;
  currency: 'SAR';
  status: PaymentStatus;
  provider_intent_id: string | null;
  created_at: Date;
}

const INSERT_SQL = `
  INSERT INTO payments (id, reservation_id, user_id, amount, currency, status, payment_method_token)
  VALUES ($1, $2, $3, $4, 'SAR', 'AUTHORIZING', $5) RETURNING *`;

// Conditional transition: applies only from a legal source status (state machine), 1 row or 0.
const TRANSITION_SQL = `
  UPDATE payments SET status = $2, failure_code = COALESCE($4, failure_code), updated_at = now()
  WHERE id = $1 AND status = ANY($3::text[]) RETURNING 1`;

const STALE_SQL = `
  SELECT *, (created_at < now() - make_interval(secs => $2)) AS timed_out FROM payments
  WHERE status = 'AUTHORIZING' AND created_at < now() - make_interval(secs => $1)
  ORDER BY created_at LIMIT $3`;

export type StalePayment = PaymentRecord & { timedOut: boolean };

@Injectable()
export class PaymentsRepository {
  constructor(private readonly db: Database) {}

  async insert(tx: SqlExecutor, p: { id: string; reservationId: string; userId: string; amount: number; token: string }) {
    const { rows } = await tx.query<PaymentRow>(INSERT_SQL, [p.id, p.reservationId, p.userId, p.amount, p.token]);
    return toRecord(rows[0]);
  }

  async setIntent(paymentId: string, intentId: string): Promise<void> {
    await this.db.query('UPDATE payments SET provider_intent_id = $2 WHERE id = $1 AND provider_intent_id IS NULL', [paymentId, intentId]);
  }

  async lockByIntent(tx: SqlExecutor, intentId: string): Promise<PaymentRecord | null> {
    const { rows } = await tx.query<PaymentRow>('SELECT * FROM payments WHERE provider_intent_id = $1 FOR UPDATE', [intentId]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findById(id: string): Promise<PaymentRecord | null> {
    return this.lockById(this.db, id, '');
  }

  async lockById(tx: SqlExecutor, id: string, lock = 'FOR UPDATE'): Promise<PaymentRecord | null> {
    const { rows } = await tx.query<PaymentRow>(`SELECT * FROM payments WHERE id = $1 ${lock}`, [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async transition(tx: SqlExecutor, id: string, to: PaymentStatus, failureCode: string | null = null): Promise<boolean> {
    const res = await tx.query(TRANSITION_SQL, [id, to, paymentSourcesOf(to), failureCode]);
    return res.rowCount === 1;
  }

  async summariesByReservation(reservationIds: string[]): Promise<Map<string, PaymentSummary>> {
    if (reservationIds.length === 0) return new Map();
    const { rows } = await this.db.query<PaymentRow>('SELECT * FROM payments WHERE reservation_id = ANY($1::uuid[])', [reservationIds]);
    return new Map(rows.map((r) => [r.reservation_id, toSummary(r)]));
  }

  async findStaleAuthorizing(afterSeconds: number, timeoutSeconds: number, limit: number): Promise<StalePayment[]> {
    const { rows } = await this.db.query<PaymentRow & { timed_out: boolean }>(STALE_SQL, [afterSeconds, timeoutSeconds, limit]);
    return rows.map((r) => ({ ...toRecord(r), timedOut: r.timed_out }));
  }
}

function toSummary(r: PaymentRow): PaymentSummary {
  return { id: r.id, status: r.status, amount: r.amount, currency: 'SAR' };
}

function toRecord(r: PaymentRow): PaymentRecord {
  return {
    ...toSummary(r), reservationId: r.reservation_id, userId: r.user_id,
    providerIntentId: r.provider_intent_id, createdAt: r.created_at,
  };
}
