import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { SqlExecutor } from '../../../shared/database/sql-executor';
import { EventOutcome, ProviderEvent } from '../domain/payment.types';

// Duplicate deliveries hit the primary key and insert nothing => processed exactly once.
const INSERT_SQL = `
  INSERT INTO payment_events (event_id, type, payment_intent_id, payload, outcome)
  VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING RETURNING 1`;

const ORPHANS_SQL = `
  SELECT payload FROM payment_events
  WHERE outcome = 'ORPHAN' AND received_at < now() - interval '3 seconds'
  ORDER BY received_at LIMIT $1`;

@Injectable()
export class PaymentEventsRepository {
  constructor(private readonly db: Database) {}

  async insertIfNew(tx: SqlExecutor, event: ProviderEvent, outcome: EventOutcome | 'RECEIVED' = 'RECEIVED'): Promise<boolean> {
    const res = await tx.query(INSERT_SQL, [event.eventId, event.type, event.paymentIntentId, JSON.stringify(event), outcome]);
    return res.rowCount === 1;
  }

  async markOutcome(tx: SqlExecutor, eventId: string, outcome: EventOutcome): Promise<void> {
    await tx.query('UPDATE payment_events SET outcome = $2, processed_at = now() WHERE event_id = $1', [eventId, outcome]);
  }

  async findOrphans(limit: number): Promise<ProviderEvent[]> {
    const { rows } = await this.db.query<{ payload: ProviderEvent }>(ORPHANS_SQL, [limit]);
    return rows.map((r) => r.payload);
  }
}
