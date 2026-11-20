import { Injectable } from '@nestjs/common';
import { SqlExecutor } from '../../../shared/database/sql-executor';
import { AnalyticsEventRecord } from '../domain/analytics-event';

// Single round-trip batch insert using parallel arrays.
const INSERT_BATCH_SQL = `
  INSERT INTO analytics_events
    (user_id, source, type, jameya_id, position, surface, experiment_key, variant, occurred_at)
  SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[], $4::uuid[], $5::int[], $6::text[],
                       $7::text[], $8::text[], $9::timestamptz[])`;

@Injectable()
export class AnalyticsRepository {
  async insertMany(executor: SqlExecutor, events: AnalyticsEventRecord[]): Promise<number> {
    if (events.length === 0) return 0;
    const col = <K extends keyof AnalyticsEventRecord>(k: K) => events.map((e) => e[k]);
    await executor.query(INSERT_BATCH_SQL, [
      col('userId'), col('source'), col('type'), col('jameyaId'), col('position'),
      col('surface'), col('experimentKey'), col('variant'), col('occurredAt'),
    ]);
    return events.length;
  }
}
