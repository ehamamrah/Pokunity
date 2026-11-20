import Redis from 'ioredis';
import { resolve } from 'node:path';
import { Client, Pool } from 'pg';
import { runMigrations } from '../../src/shared/database/migrator';
import { applyTestEnv } from './test-env';

async function recreateDatabase(url: URL): Promise<void> {
  const name = url.pathname.slice(1);
  if (!name.endsWith('_test')) throw new Error(`refusing to reset non-test database "${name}"`);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
}

/** Fresh, migrated test database and an empty Redis logical DB for every run. */
export default async function globalSetup(): Promise<void> {
  applyTestEnv();
  const url = new URL(process.env.DATABASE_URL as string);
  await recreateDatabase(url);
  const pool = new Pool({ connectionString: url.toString() });
  await runMigrations(pool, resolve(__dirname, '../../migrations'), () => undefined);
  await pool.end();
  const redis = new Redis(process.env.REDIS_URL as string);
  await redis.flushdb();
  await redis.quit();
}
