import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { SqlExecutor } from '../../../shared/database/sql-executor';

export type OutboxCommand = 'AUTHORIZE' | 'CAPTURE' | 'VOID';

export interface OutboxItem {
  id: string;
  paymentId: string;
  command: OutboxCommand;
  attempts: number;
  intentId: string | null;
  amount: number;
  token: string;
  paymentStatus: string;
}

// Settlement (CAPTURE | VOID): one per payment. A VOID that already completed is re-armed if a late
// authorization shows up again (authorize-after-void race).
const ENQUEUE_SETTLEMENT_SQL = `
  INSERT INTO payment_outbox (payment_id, command) VALUES ($1, $2)
  ON CONFLICT (payment_id) WHERE command IN ('CAPTURE', 'VOID') DO UPDATE
    SET status = 'PENDING', next_attempt_at = now()
  WHERE payment_outbox.command = 'VOID' AND EXCLUDED.command = 'VOID' AND payment_outbox.status = 'DONE'`;

const ENQUEUE_AUTHORIZE_SQL = `
  INSERT INTO payment_outbox (payment_id, command) VALUES ($1, 'AUTHORIZE') ON CONFLICT (payment_id, command) DO NOTHING`;

// Lease-based claim (SKIP LOCKED) joined with the payment data the relay needs: one round trip
// for the whole batch instead of one lookup per item (no N+1).
const CLAIM_SQL = `
  WITH claimed AS (
    UPDATE payment_outbox SET attempts = attempts + 1, next_attempt_at = now() + interval '30 seconds'
    WHERE id IN (SELECT id FROM payment_outbox WHERE status = 'PENDING' AND next_attempt_at <= now()
                 ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
    RETURNING id, payment_id, command, attempts)
  SELECT c.*, p.provider_intent_id, p.amount, p.payment_method_token, p.status AS payment_status
  FROM claimed c JOIN payments p ON p.id = c.payment_id`;

const RETRY_SQL = `
  UPDATE payment_outbox SET last_error = $2,
    status = CASE WHEN attempts >= $3 THEN 'DEAD' ELSE 'PENDING' END,
    next_attempt_at = now() + make_interval(secs => least(power(2, attempts), 300))
  WHERE id = $1`;

interface ClaimRow {
  id: string; payment_id: string; command: OutboxCommand; attempts: number;
  provider_intent_id: string | null; amount: number; payment_method_token: string; payment_status: string;
}

@Injectable()
export class OutboxRepository {
  static readonly MAX_ATTEMPTS = 12;

  constructor(private readonly db: Database) {}

  async enqueue(tx: SqlExecutor, paymentId: string, command: Exclude<OutboxCommand, 'AUTHORIZE'>): Promise<void> {
    await tx.query(ENQUEUE_SETTLEMENT_SQL, [paymentId, command]);
  }

  async enqueueAuthorize(tx: SqlExecutor, paymentId: string): Promise<void> {
    await tx.query(ENQUEUE_AUTHORIZE_SQL, [paymentId]);
  }

  /** Stops a not-yet-executed authorization (the payment already reached a final outcome). */
  async cancelPendingAuthorize(tx: SqlExecutor, paymentId: string): Promise<void> {
    await tx.query(`UPDATE payment_outbox SET status = 'DONE', completed_at = now(), last_error = 'cancelled'
      WHERE payment_id = $1 AND command = 'AUTHORIZE' AND status = 'PENDING'`, [paymentId]);
  }

  async claimDue(limit: number): Promise<OutboxItem[]> {
    const { rows } = await this.db.query<ClaimRow>(CLAIM_SQL, [limit]);
    return rows.map((r) => ({
      id: r.id, paymentId: r.payment_id, command: r.command, attempts: r.attempts, intentId: r.provider_intent_id,
      amount: r.amount, token: r.payment_method_token, paymentStatus: r.payment_status,
    }));
  }

  async complete(tx: SqlExecutor, id: string): Promise<void> {
    await tx.query(`UPDATE payment_outbox SET status = 'DONE', completed_at = now(), last_error = NULL WHERE id = $1`, [id]);
  }

  async scheduleRetry(id: string, error: string): Promise<void> {
    await this.db.query(RETRY_SQL, [id, error.slice(0, 500), OutboxRepository.MAX_ATTEMPTS]);
  }
}
