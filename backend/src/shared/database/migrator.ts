import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool, PoolClient } from 'pg';

const LOCK = 'pokunity:migrations';

async function appliedMigrations(client: PoolClient): Promise<Set<string>> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

async function pendingMigrations(client: PoolClient, dir: string): Promise<string[]> {
  const applied = await appliedMigrations(client);
  return (await readdir(dir)).filter((f) => f.endsWith('.sql') && !applied.has(f)).sort();
}

async function applyOne(client: PoolClient, dir: string, file: string): Promise<void> {
  const sql = await readFile(join(dir, file), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Forward-only SQL migrations, each in its own transaction, serialised across instances with an
 * advisory lock so that several containers can start simultaneously.
 */
export async function runMigrations(pool: Pool, dir: string, log: (m: string) => void): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK]);
    const pending = await pendingMigrations(client, dir);
    for (const file of pending) {
      await applyOne(client, dir, file);
      log(`applied migration ${file}`);
    }
    return pending;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK]).catch(() => undefined);
    client.release();
  }
}
