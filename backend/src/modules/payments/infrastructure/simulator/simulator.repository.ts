import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Database } from '../../../../shared/database/database.service';
import { AuthorizeRequest, IntentStatus, IntentView } from '../../payment-gateway.port';

const INSERT_SQL = `
  INSERT INTO simulator_payment_intents (id, merchant_reference, amount, currency, token, status)
  VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (merchant_reference) DO NOTHING RETURNING id`;

const TRANSITION_SQL = `
  UPDATE simulator_payment_intents SET status = $2, failure_code = $4, updated_at = now()
  WHERE id = $1 AND status = ANY($3::text[]) RETURNING id`;

export const newIntentId = () => `pi_${randomBytes(12).toString('hex')}`;

/** Persistent state of the simulated provider (survives restarts, like a real PSP would). */
@Injectable()
export class SimulatorRepository {
  constructor(private readonly db: Database) {}

  /** Idempotent on merchant reference: returns the existing intent on retries, `created=false`. */
  async create(req: AuthorizeRequest, status: IntentStatus): Promise<{ intentId: string; created: boolean }> {
    const { rows } = await this.db.query<{ id: string }>(INSERT_SQL, [newIntentId(), req.reference, req.amount, req.currency, req.token, status]);
    if (rows[0]) return { intentId: rows[0].id, created: true };
    const existing = await this.find({ intentId: null, reference: req.reference });
    return { intentId: (existing as IntentView).intentId, created: false };
  }

  async transition(intentId: string, to: IntentStatus, from: IntentStatus[], failureCode: string | null = null) {
    return (await this.db.query(TRANSITION_SQL, [intentId, to, from, failureCode])).rowCount === 1;
  }

  async find(lookup: { intentId: string | null; reference: string }): Promise<IntentView | null> {
    const { rows } = await this.db.query<{ id: string; status: IntentStatus }>(
      'SELECT id, status FROM simulator_payment_intents WHERE id = $1 OR merchant_reference = $2 LIMIT 1',
      [lookup.intentId, lookup.reference],
    );
    return rows[0] ? { intentId: rows[0].id, status: rows[0].status } : null;
  }

  async amountOf(intentId: string): Promise<number> {
    const { rows } = await this.db.query<{ amount: number }>('SELECT amount FROM simulator_payment_intents WHERE id = $1', [intentId]);
    return rows[0]?.amount ?? 0;
  }
}
