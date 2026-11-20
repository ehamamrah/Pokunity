import { expect, it } from 'vitest';
import { createIdempotencyRegistry } from './idempotency';

function sequentialKeys(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `key-${counter}`;
  };
}

it('reuses the same key for the same intent (automatic retries)', () => {
  const registry = createIdempotencyRegistry(sequentialKeys());
  const first = registry.keyFor('reserve:jameya:7');
  expect(registry.keyFor('reserve:jameya:7')).toBe(first);
});

it('issues a new key for a different intent (new seat selection)', () => {
  const registry = createIdempotencyRegistry(sequentialKeys());
  const seven = registry.keyFor('reserve:jameya:7');
  expect(registry.keyFor('reserve:jameya:8')).not.toBe(seven);
});

it('issues a fresh key once the intent is settled', () => {
  const registry = createIdempotencyRegistry(sequentialKeys());
  const before = registry.keyFor('reserve:jameya:7');
  registry.settle('reserve:jameya:7');
  expect(registry.keyFor('reserve:jameya:7')).not.toBe(before);
  expect(registry.size()).toBe(1);
});
