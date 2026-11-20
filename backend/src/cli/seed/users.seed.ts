import { Pool } from 'pg';
import { DEMO_USERS, DemoUser } from './demo-users';

const UPSERT_USER = `
  INSERT INTO users (email, name, password_hash, risk_tier, typical_monthly_amount, preferred_durations)
  VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`;

const SEED_PROFILE = `
  INSERT INTO kyc_simulator_profiles (user_id, status, behavior)
  SELECT id, $2, $3 FROM users WHERE email = $1 ON CONFLICT (user_id) DO NOTHING`;

const SEED_BEHAVIOR = `
  INSERT INTO user_behavior (user_id, expired_holds_count)
  SELECT id, $2 FROM users WHERE email = $1 ON CONFLICT (user_id) DO NOTHING`;

// 1 000 KYC-verified members for the contention test, one set-based statement each.
const LOAD_USERS = `
  INSERT INTO users (email, name, password_hash, risk_tier)
  SELECT 'loadtest+' || g || '@pokunity.app', 'Load Tester ' || g, $1, 'LOW' FROM generate_series(1, $2) g
  ON CONFLICT (email) DO NOTHING`;

const LOAD_PROFILES = `
  INSERT INTO kyc_simulator_profiles (user_id, status)
  SELECT id, 'VERIFIED' FROM users WHERE email LIKE 'loadtest+%' ON CONFLICT (user_id) DO NOTHING`;

async function seedDemoUser(pool: Pool, u: DemoUser, hash: string): Promise<void> {
  await pool.query(UPSERT_USER, [u.email, u.name, hash, u.riskTier, u.typicalMonthlyAmount, u.preferredDurations]);
  await pool.query(SEED_PROFILE, [u.email, u.kyc, u.kycBehavior]);
  await pool.query(SEED_BEHAVIOR, [u.email, u.expiredHolds]);
}

export async function seedUsers(pool: Pool, passwordHash: string, loadTestUsers: number): Promise<void> {
  for (const user of DEMO_USERS) await seedDemoUser(pool, user, passwordHash);
  await pool.query(LOAD_USERS, [passwordHash, loadTestUsers]);
  await pool.query(LOAD_PROFILES);
}
