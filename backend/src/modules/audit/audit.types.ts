export interface AuditEntry {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  data?: Record<string, unknown>;
}
