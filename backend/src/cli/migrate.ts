import { resolve } from 'node:path';
import { Pool } from 'pg';
import { runMigrations } from '../shared/database/migrator';

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const dir = process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), 'migrations');
  try {
    const applied = await runMigrations(pool, dir, (m) => console.log(JSON.stringify({ level: 'info', msg: m })));
    console.log(JSON.stringify({ level: 'info', msg: 'migrations complete', applied: applied.length }));
  } finally {
    await pool.end();
  }
}

main().catch((error: Error) => {
  console.error(JSON.stringify({ level: 'error', msg: 'migration failed', error: error.message }));
  process.exit(1);
});
