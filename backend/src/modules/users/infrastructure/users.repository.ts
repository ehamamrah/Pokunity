import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { SqlExecutor } from '../../../shared/database/sql-executor';
import { RiskTier, UserCredentials, UserProfile } from '../domain/user.types';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  risk_tier: RiskTier;
  typical_monthly_amount: number | null;
  preferred_durations: number[];
  expired_holds_count: number;
  confirmed_count: number;
  confirmed_monthly_total: number;
}

export type UserRecord = UserProfile & {
  expiredHoldsCount: number;
  confirmedCount: number;
  confirmedMonthlyTotal: number;
};

const SELECT_USER = `
  SELECT u.*, COALESCE(b.expired_holds_count, 0) AS expired_holds_count,
         COALESCE(b.confirmed_count, 0) AS confirmed_count,
         COALESCE(b.confirmed_monthly_total, 0) AS confirmed_monthly_total
  FROM users u LEFT JOIN user_behavior b ON b.user_id = u.id`;

const BUMP_EXPIRED_SQL = `
  INSERT INTO user_behavior (user_id, expired_holds_count)
  SELECT id, n FROM unnest($1::uuid[], $2::int[]) AS t(id, n)
  ON CONFLICT (user_id) DO UPDATE
    SET expired_holds_count = user_behavior.expired_holds_count + EXCLUDED.expired_holds_count,
        updated_at = now()`;

const BUMP_CONFIRMED_SQL = `
  INSERT INTO user_behavior (user_id, confirmed_count, confirmed_monthly_total) VALUES ($1, 1, $2)
  ON CONFLICT (user_id) DO UPDATE
    SET confirmed_count = user_behavior.confirmed_count + 1,
        confirmed_monthly_total = user_behavior.confirmed_monthly_total + EXCLUDED.confirmed_monthly_total,
        updated_at = now()`;

@Injectable()
export class UsersRepository {
  constructor(private readonly db: Database) {}

  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const { rows } = await this.db.query<UserRow>(`${SELECT_USER} WHERE u.email = $1`, [email.toLowerCase()]);
    const row = rows[0];
    return row ? { id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash } : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRow>(`${SELECT_USER} WHERE u.id = $1`, [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async incrementExpiredHolds(executor: SqlExecutor, userIds: string[]): Promise<void> {
    const counts = new Map<string, number>();
    userIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    await executor.query(BUMP_EXPIRED_SQL, [[...counts.keys()], [...counts.values()]]);
  }

  async recordConfirmed(executor: SqlExecutor, userId: string, monthlyAmount: number): Promise<void> {
    await executor.query(BUMP_CONFIRMED_SQL, [userId, monthlyAmount]);
  }
}

function toRecord(row: UserRow): UserRecord {
  const preferences = {
    ...(row.typical_monthly_amount !== null ? { typicalMonthlyAmount: row.typical_monthly_amount } : {}),
    preferredDurations: row.preferred_durations ?? [],
  };
  return {
    id: row.id, name: row.name, email: row.email, riskTier: row.risk_tier, preferences,
    expiredHoldsCount: row.expired_holds_count, confirmedCount: row.confirmed_count,
    confirmedMonthlyTotal: row.confirmed_monthly_total,
  };
}
