import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { namedSql, SqlExecutor } from '../../../shared/database/sql-executor';
import { sourcesOf } from '../domain/reservation-state-machine';
import { FailureReason, ReservationRecord, ReservationStatus } from '../domain/reservation.types';

interface Row {
  id: string; user_id: string; jameya_id: string; jameya_name: string; seat_number: number; fee: number;
  monthly_amount: number; status: ReservationStatus; failure_reason: FailureReason | null;
  expires_at: Date; created_at: Date; updated_at: Date;
}

export interface NewReservation {
  id: string; userId: string; jameyaId: string; jameyaName: string; seatNumber: number;
  fee: number; monthlyAmount: number; ttlSeconds: number;
}

const INSERT_SQL = namedSql('reservations_insert', `
  INSERT INTO reservations (id, user_id, jameya_id, jameya_name, seat_number, fee, monthly_amount, status, expires_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, 'HELD', now() + make_interval(secs => $8)) RETURNING *`);

// Answered by the covering partial index reservations_active_by_user_idx (index-only scan).
const ACTIVE_SQL = namedSql('reservations_active_summary', `
  SELECT count(*)::int AS total, (array_agg(id) FILTER (WHERE jameya_id = $2))[1] AS in_jameya
  FROM reservations WHERE user_id = $1 AND status IN ('HELD', 'PAYMENT_PENDING')`);

// Conditional, state-machine-driven transition. $5 = require the hold to still be unexpired.
const TRANSITION_SQL = `
  UPDATE reservations SET status = $2, failure_reason = $4, updated_at = now()
  WHERE id = $1 AND status = ANY($3::text[]) AND (NOT $5 OR expires_at > now())
  RETURNING *`;

const PAGE_SQL = namedSql('reservations_page', `
  SELECT p.*, t.total FROM
    (SELECT count(*)::int AS total FROM reservations
     WHERE user_id = $1 AND ($2::text[] IS NULL OR status = ANY($2::text[]))) t
  LEFT JOIN LATERAL
    (SELECT * FROM reservations WHERE user_id = $1 AND ($2::text[] IS NULL OR status = ANY($2::text[]))
     ORDER BY created_at DESC, id LIMIT $3 OFFSET $4) p ON true`);

// Sweeper: ONLY status = 'HELD' is ever expired; PAYMENT_PENDING can never match.
const EXPIRE_BATCH_SQL = `
  UPDATE reservations r SET status = 'EXPIRED', failure_reason = 'HOLD_EXPIRED', updated_at = now()
  FROM (SELECT id FROM reservations WHERE status = 'HELD' AND expires_at < now()
        ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED) due
  WHERE r.id = due.id AND r.status = 'HELD'
  RETURNING r.*`;

@Injectable()
export class ReservationsRepository {
  constructor(private readonly db: Database) {}

  /** Serialises one member's concurrent booking attempts (hold-limit check + insert). */
  async lockMember(tx: SqlExecutor, userId: string): Promise<void> {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reservations:user:${userId}`]);
  }

  async insert(tx: SqlExecutor, r: NewReservation): Promise<ReservationRecord> {
    const values = [r.id, r.userId, r.jameyaId, r.jameyaName, r.seatNumber, r.fee, r.monthlyAmount, r.ttlSeconds];
    return toRecord((await tx.query<Row>(INSERT_SQL, values)).rows[0]);
  }

  async activeSummary(executor: SqlExecutor, userId: string, jameyaId: string | null) {
    const { rows } = await executor.query<{ total: number; in_jameya: string | null }>(ACTIVE_SQL, [userId, jameyaId]);
    return { activeHolds: rows[0].total, activeReservationInJameya: rows[0].in_jameya };
  }

  async lock(tx: SqlExecutor, id: string): Promise<ReservationRecord | null> {
    const { rows } = await tx.query<Row>('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async transition(
    tx: SqlExecutor, id: string, to: ReservationStatus,
    opts: { failureReason?: FailureReason; requireUnexpired?: boolean; from?: ReservationStatus[] } = {},
  ): Promise<ReservationRecord | null> {
    const from = (opts.from ?? sourcesOf(to)).filter((s) => sourcesOf(to).includes(s));
    const values = [id, to, from, opts.failureReason ?? null, opts.requireUnexpired ?? false];
    const { rows } = await tx.query<Row>(TRANSITION_SQL, values);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async expireDue(tx: SqlExecutor, limit: number): Promise<ReservationRecord[]> {
    return (await tx.query<Row>(EXPIRE_BATCH_SQL, [limit])).rows.map(toRecord);
  }

  async findById(id: string): Promise<ReservationRecord | null> {
    const { rows } = await this.db.query<Row>('SELECT * FROM reservations WHERE id = $1', [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /** One round trip for the page AND the total (the LATERAL page may be empty past the last page). */
  async pageByUser(userId: string, statuses: ReservationStatus[] | null, page: { limit: number; offset: number }) {
    const { rows } = await this.db.query<Row & { total: number }>(PAGE_SQL, [userId, statuses, page.limit, page.offset]);
    const records = rows.filter((r) => r.id !== null).map(toRecord);
    return { records, total: rows[0]?.total ?? 0 };
  }
}

function toRecord(r: Row): ReservationRecord {
  return {
    id: r.id, userId: r.user_id, jameyaId: r.jameya_id, jameyaName: r.jameya_name, seatNumber: r.seat_number,
    fee: r.fee, monthlyAmount: r.monthly_amount, status: r.status, failureReason: r.failure_reason,
    expiresAt: r.expires_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
