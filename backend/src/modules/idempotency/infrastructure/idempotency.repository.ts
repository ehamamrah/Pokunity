import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { namedSql } from '../../../shared/database/sql-executor';
import { IdempotencyRow } from '../domain/idempotency-record';

// Claims a new key, or recycles one whose 24h retention has elapsed.
const CLAIM_SQL = namedSql('idempotency_claim', `
  INSERT INTO idempotency_keys (user_id, key, request_hash, status, locked_until, expires_at)
  VALUES ($1, $2, $3, 'IN_PROGRESS', now() + make_interval(secs => $4), now() + interval '24 hours')
  ON CONFLICT (user_id, key) DO UPDATE
    SET request_hash = EXCLUDED.request_hash, status = 'IN_PROGRESS', response_status = NULL,
        response_body = NULL, locked_until = EXCLUDED.locked_until, expires_at = EXCLUDED.expires_at,
        created_at = now()
    WHERE idempotency_keys.expires_at < now()
  RETURNING 1`);

const FIND_SQL = `
  SELECT request_hash, status, response_status, response_body, locked_until < now() AS lock_expired
  FROM idempotency_keys WHERE user_id = $1 AND key = $2`;

// Takes over an IN_PROGRESS key whose owner crashed (lease expired). Conditional => one winner.
const TAKE_OVER_SQL = `
  UPDATE idempotency_keys SET locked_until = now() + make_interval(secs => $3)
  WHERE user_id = $1 AND key = $2 AND status = 'IN_PROGRESS' AND locked_until < now()
  RETURNING 1`;

const COMPLETE_SQL = namedSql('idempotency_complete', `
  UPDATE idempotency_keys SET status = 'COMPLETED', response_status = $3, response_body = $4
  WHERE user_id = $1 AND key = $2`);

@Injectable()
export class IdempotencyRepository {
  static readonly LEASE_SECONDS = 60;

  constructor(private readonly db: Database) {}

  async claim(userId: string, key: string, hash: string): Promise<boolean> {
    const res = await this.db.query(CLAIM_SQL, [userId, key, hash, IdempotencyRepository.LEASE_SECONDS]);
    return res.rowCount === 1;
  }

  async find(userId: string, key: string): Promise<IdempotencyRow | null> {
    const res = await this.db.query<IdempotencyRow>(FIND_SQL, [userId, key]);
    return res.rows[0] ?? null;
  }

  async takeOver(userId: string, key: string): Promise<boolean> {
    const res = await this.db.query(TAKE_OVER_SQL, [userId, key, IdempotencyRepository.LEASE_SECONDS]);
    return res.rowCount === 1;
  }

  async complete(userId: string, key: string, status: number, body: unknown): Promise<void> {
    await this.db.query(COMPLETE_SQL, [userId, key, status, JSON.stringify(body ?? null)]);
  }

  async release(userId: string, key: string): Promise<void> {
    await this.db.query(`DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2 AND status = 'IN_PROGRESS'`, [userId, key]);
  }

  async purgeExpired(): Promise<number> {
    const res = await this.db.query(`DELETE FROM idempotency_keys WHERE expires_at < now()`);
    return res.rowCount ?? 0;
  }
}
