import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { DEMO_PASSWORD } from './seed/demo-users';
import { seedFeatured } from './seed/featured.seed';
import { seedJameyas } from './seed/jameyas.seed';
import { seedUsers } from './seed/users.seed';

const log = (msg: string, extra: object = {}) => console.log(JSON.stringify({ level: 'info', msg, ...extra }));

/** Idempotent seed: safe to run on every container start (ON CONFLICT / NOT EXISTS everywhere). */
async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const started = Date.now();
  try {
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await seedUsers(pool, hash, Number(process.env.SEED_LOADTEST_USERS ?? 1000));
    await seedJameyas(pool, Number(process.env.SEED_JAMEYAS ?? 5000));
    await seedFeatured(pool);
    const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM jameyas');
    log('seed complete', { jameyas: rows[0].n, ms: Date.now() - started });
  } finally {
    await pool.end();
  }
}

main().catch((error: Error) => {
  console.error(JSON.stringify({ level: 'error', msg: 'seed failed', error: error.message }));
  process.exit(1);
});
