import { createUuid } from './uuid';

/**
 * Idempotency-Key bookkeeping. A key identifies one user *intent* (a scope such as
 * "reserve seat 7 in jameya X"). Automatic retries of that intent reuse the key; a new
 * intent gets a fresh one. `settle` ends the intent once the outcome is definitive.
 */
export interface IdempotencyRegistry {
  keyFor(scope: string): string;
  settle(scope: string): void;
  size(): number;
}

function keyForIn(keys: Map<string, string>, newKey: () => string, scope: string): string {
  const existing = keys.get(scope);
  if (existing !== undefined) return existing;
  const created = newKey();
  keys.set(scope, created);
  return created;
}

export function createIdempotencyRegistry(newKey: () => string = createUuid): IdempotencyRegistry {
  const keys = new Map<string, string>();
  return {
    keyFor: (scope) => keyForIn(keys, newKey, scope),
    settle: (scope) => {
      keys.delete(scope);
    },
    size: () => keys.size,
  };
}

export const idempotencyKeys: IdempotencyRegistry = createIdempotencyRegistry();
