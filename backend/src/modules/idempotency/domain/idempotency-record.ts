export type IdempotencyBegin =
  | { kind: 'proceed' }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'in_progress' }
  | { kind: 'mismatch' };

export interface IdempotencyRow {
  request_hash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  response_status: number | null;
  response_body: unknown;
  lock_expired: boolean;
}

/** Pure decision for an already existing key (Specification of the README idempotency table). */
export function decideExisting(row: IdempotencyRow, requestHash: string): IdempotencyBegin {
  if (row.request_hash !== requestHash) return { kind: 'mismatch' };
  if (row.status === 'COMPLETED') {
    return { kind: 'replay', status: row.response_status ?? 200, body: row.response_body };
  }
  return row.lock_expired ? { kind: 'proceed' } : { kind: 'in_progress' };
}
