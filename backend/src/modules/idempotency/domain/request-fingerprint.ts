import { createHash } from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
}

/**
 * Fingerprint of an idempotent request: method + path + canonical JSON body (key order
 * independent). A key reused with a different fingerprint is rejected (422).
 */
export function fingerprint(method: string, path: string, body: unknown): string {
  const canonical = JSON.stringify(canonicalize(body ?? {}));
  return createHash('sha256').update(`${method.toUpperCase()} ${path}\n${canonical}`).digest('hex');
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidIdempotencyKey(key: string | undefined): key is string {
  return typeof key === 'string' && UUID_V4.test(key);
}

/** Only deterministic outcomes are stored; transient ones (5xx, 429) may be retried with the same key. */
export function isReplayableStatus(status: number): boolean {
  return status < 500 && status !== 429;
}
