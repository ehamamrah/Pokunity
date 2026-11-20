import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResultRow, types } from 'pg';
import { AppConfig } from '../config/app-config';
import { SqlExecutor } from './sql-executor';

// BIGINT money columns and counts fit safely in JS numbers (minor units); DATE stays a string.
types.setTypeParser(types.builtins.INT8, (v) => Number.parseInt(v, 10));
types.setTypeParser(types.builtins.DATE, (v) => v);

/** Owns the connection pool and the transaction boundary helper. */
@Injectable()
export class Database implements SqlExecutor, OnModuleDestroy {
  readonly pool: Pool;

  constructor(config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.env.DATABASE_URL,
      max: config.env.DB_POOL_MAX,
      application_name: 'pokunity-backend',
    });
  }

  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    return this.pool.query<R>(text, values);
  }

  /** Runs `work` in a single READ COMMITTED transaction; rolls back on any error. */
  async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<boolean> {
    return this.pool.query('SELECT 1').then(() => true, () => false);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
