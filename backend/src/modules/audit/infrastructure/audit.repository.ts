import { Injectable } from '@nestjs/common';
import { SqlExecutor } from '../../../shared/database/sql-executor';
import { AuditEntry } from '../audit.types';

const INSERT_SQL = `
  INSERT INTO audit_log (actor, action, entity_type, entity_id, data, trace_id)
  VALUES ($1, $2, $3, $4, $5, $6)`;

@Injectable()
export class AuditRepository {
  async insert(executor: SqlExecutor, entry: AuditEntry, traceId?: string): Promise<void> {
    const { actor, action, entityType, entityId, data } = entry;
    await executor.query(INSERT_SQL, [actor, action, entityType, entityId, data ?? {}, traceId ?? null]);
  }
}
