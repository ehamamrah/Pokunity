import { Injectable } from '@nestjs/common';
import { Database } from '../../shared/database/database.service';
import { SqlExecutor } from '../../shared/database/sql-executor';
import { RequestContextStore } from '../../shared/logging/request-context';
import { AuditEntry } from './audit.types';
import { AuditRepository } from './infrastructure/audit.repository';

/**
 * Public API of the audit module. Pass the caller's transaction executor so the audit record
 * commits atomically with the state change it describes (append-only table, DB-enforced).
 */
@Injectable()
export class AuditFacade {
  constructor(
    private readonly db: Database,
    private readonly repository: AuditRepository,
  ) {}

  async record(entry: AuditEntry, executor: SqlExecutor = this.db): Promise<void> {
    await this.repository.insert(executor, entry, RequestContextStore.requestId());
  }
}
