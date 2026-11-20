import { Module } from '@nestjs/common';
import { AuditFacade } from './audit.facade';
import { AuditRepository } from './infrastructure/audit.repository';

/** Owns: audit_log (append-only). */
@Module({ providers: [AuditFacade, AuditRepository], exports: [AuditFacade] })
export class AuditModule {}
