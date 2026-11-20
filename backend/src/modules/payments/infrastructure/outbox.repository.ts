import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { SqlExecutor } from '../../../shared/database/sql-executor';

export type OutboxCommand = 'CAPTURE' | 'VOID';

export interface OutboxItem {
  id: string;
  paymentId: string;
  command: OutboxCommand;
  attempts: number;
}

// One settlement command per payment. A VOID that already completed is re-armed if a late
// authorization shows up again (authorize-after-void race).
const ENQUEUE_SQL = `
  INSERT INTO payment_outbox (payment_id, command) VALUES ($1, $2)
  ON CONFLICT (payment_id) DO UPDATE SET status = 'PENDING', next_attempt_at = now()
  WHERE payment_outbox.command = 'VOID' AND EXCLUDED.command = 'VOID' AND payment_outbox.status = 'DONE'`;

// Lease-based claim: SKIP LOCKED lets several workers share the queue without double execution;
// the lease (next_attempt_at in the future) protects items while the provider call is in flight.
const CLAIM_SQL = `
  UPDATE payment_outbox SET attempts = attempts + 1, next_attempt_at = now() + interval '30 seconds'
  WHERE id IN (SELECT id FROM payment_outbox WHERE status = 'PENDING' AND next_attempt_at <= now()
               ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
  RETURNING id, payment_id, command, attempts`;

const RETRY_SQL = `
  UPDATE payment_outbox SET last_error = $2,
    status = CASE WHEN attempts >= $3 THEN 'DEAD' ELSE 'PENDING' END,
    next_attempt_at = now() + make_interval(secs => least(power(2, attempts), 300))
  WHERE id = $1`;

@Injectable()
export class OutboxRepository {
  static readonly MAX_ATTEMPTS = 12;

  constructor(private readonly db: Database) {}

  async enqueue(tx: SqlExecutor, paymentId: string, command: OutboxCommand): Promise<void> {
    await tx.query(ENQUEUE_SQL, [paymentId, command]);
  }

  async claimDue(limit: number): Promise<OutboxItem[]> {
    const { rows } = await this.db.query<{ id: string; payment_id: string; command: OutboxCommand; attempts: number }>(CLAIM_SQL, [limit]);
    return rows.map((r) => ({ id: r.id, paymentId: r.payment_id, command: r.command, attempts: r.attempts }));
  }

  async complete(tx: SqlExecutor, id: string): Promise<void> {
    await tx.query(`UPDATE payment_outbox SET status = 'DONE', completed_at = now(), last_error = NULL WHERE id = $1`, [id]);
  }

  async scheduleRetry(id: string, error: string): Promise<void> {
    await this.db.query(RETRY_SQL, [id, error.slice(0, 500), OutboxRepository.MAX_ATTEMPTS]);
  }
}
