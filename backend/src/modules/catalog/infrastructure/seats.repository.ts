import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { namedSql, SqlExecutor } from '../../../shared/database/sql-executor';

// THE seat claim. Conditional on status = 'AVAILABLE', so exactly one concurrent transaction can win;
// losers block on the row lock, re-evaluate the predicate after the winner commits, and match 0 rows.
const CLAIM_SQL = namedSql('seats_claim', `
  UPDATE seats SET status = 'HELD', reservation_id = $3, holder_user_id = $4, updated_at = now()
  WHERE jameya_id = $1 AND seat_number = $2 AND status = 'AVAILABLE'
  RETURNING fee`);

// Releases only seats still HELD *by these reservations* (never someone else's or a TAKEN seat).
const RELEASE_SQL = `
  UPDATE seats SET status = 'AVAILABLE', reservation_id = NULL, holder_user_id = NULL, updated_at = now()
  WHERE reservation_id = ANY($1::uuid[]) AND status = 'HELD'
  RETURNING jameya_id`;

const TAKE_SQL = `
  UPDATE seats SET status = 'TAKEN', updated_at = now()
  WHERE reservation_id = $1 AND status = 'HELD'
  RETURNING 1`;

const AVAILABLE_COUNTS_SQL = `
  SELECT jameya_id, count(*) FILTER (WHERE status = 'AVAILABLE')::int AS available
  FROM seats WHERE jameya_id = ANY($1::uuid[]) GROUP BY jameya_id`;

@Injectable()
export class SeatsRepository {
  constructor(private readonly db: Database) {}

  async claim(tx: SqlExecutor, jameyaId: string, seatNumber: number, reservationId: string, userId: string) {
    const { rows } = await tx.query<{ fee: number }>(CLAIM_SQL, [jameyaId, seatNumber, reservationId, userId]);
    return rows[0] ? { fee: rows[0].fee } : null;
  }

  async release(tx: SqlExecutor, reservationIds: string[]): Promise<string[]> {
    if (reservationIds.length === 0) return [];
    const { rows } = await tx.query<{ jameya_id: string }>(RELEASE_SQL, [reservationIds]);
    return rows.map((r) => r.jameya_id);
  }

  async markTaken(tx: SqlExecutor, reservationId: string): Promise<boolean> {
    return (await tx.query(TAKE_SQL, [reservationId])).rowCount === 1;
  }

  async availableCounts(jameyaIds: string[]): Promise<Map<string, number>> {
    const { rows } = await this.db.query<{ jameya_id: string; available: number }>(AVAILABLE_COUNTS_SQL, [jameyaIds]);
    return new Map(rows.map((r) => [r.jameya_id, r.available]));
  }
}
