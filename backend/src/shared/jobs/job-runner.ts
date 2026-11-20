import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { Database } from '../database/database.service';

/**
 * Runs background jobs safely:
 *  - no overlapping runs inside one instance (in-flight flag),
 *  - at most one instance cluster-wide (PostgreSQL transaction-scoped advisory lock),
 *  - errors are logged, never crash the process.
 */
@Injectable()
export class JobRunner {
  private readonly logger = new Logger('jobs');
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly db: Database,
  ) {}

  get enabled(): boolean {
    return this.config.env.JOBS_ENABLED;
  }

  /** Fire-and-forget wrapper used by @Interval handlers. */
  schedule(name: string, work: () => Promise<unknown>): void {
    if (!this.enabled || this.inFlight.has(name)) return;
    this.inFlight.add(name);
    work()
      .catch((error: Error) => this.logger.error({ msg: 'job failed', job: name, error: error.message }))
      .finally(() => this.inFlight.delete(name));
  }

  /** Executes `work` only if this instance wins the cluster-wide lock for `name`. */
  async exclusive<T>(name: string, work: () => Promise<T>): Promise<T | null> {
    const client = await this.db.pool.connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [name],
      );
      if (!rows[0].locked) return null;
      return await work().finally(() => client.query('SELECT pg_advisory_unlock(hashtext($1))', [name]));
    } finally {
      client.release();
    }
  }
}
