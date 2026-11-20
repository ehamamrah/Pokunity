import { decideExisting, IdempotencyRow } from './idempotency-record';
import { fingerprint, isReplayableStatus, isValidIdempotencyKey } from './request-fingerprint';

const row = (overrides: Partial<IdempotencyRow> = {}): IdempotencyRow => ({
  request_hash: 'h1', status: 'COMPLETED', response_status: 201, response_body: { id: 'r1' }, lock_expired: false, ...overrides,
});

test('fingerprint ignores key order but not values, method or path', () => {
  const a = fingerprint('POST', '/api/v1/reservations', { jameyaId: 'j', seatNumber: 3 });
  expect(fingerprint('post', '/api/v1/reservations', { seatNumber: 3, jameyaId: 'j' })).toBe(a);
  expect(fingerprint('POST', '/api/v1/reservations', { jameyaId: 'j', seatNumber: 4 })).not.toBe(a);
  expect(fingerprint('POST', '/api/v1/reservations/x/checkout', { jameyaId: 'j', seatNumber: 3 })).not.toBe(a);
});

test('completed key with the same request is replayed with the stored status', () => {
  expect(decideExisting(row(), 'h1')).toEqual({ kind: 'replay', status: 201, body: { id: 'r1' } });
});

test('same key with a different request is rejected', () => {
  expect(decideExisting(row(), 'h2')).toEqual({ kind: 'mismatch' });
});

test('in-flight key reports in_progress until its lease expires', () => {
  expect(decideExisting(row({ status: 'IN_PROGRESS' }), 'h1')).toEqual({ kind: 'in_progress' });
  expect(decideExisting(row({ status: 'IN_PROGRESS', lock_expired: true }), 'h1')).toEqual({ kind: 'proceed' });
});

test('only UUID v4 keys are accepted; transient statuses are not stored', () => {
  expect(isValidIdempotencyKey('7e1d9c2a-4b3f-4e5a-8d6c-1f2e3a4b5c6d')).toBe(true);
  expect(isValidIdempotencyKey('not-a-uuid')).toBe(false);
  expect(isValidIdempotencyKey(undefined)).toBe(false);
  expect([409, 410, 422].every(isReplayableStatus)).toBe(true);
  expect([429, 500, 503].some(isReplayableStatus)).toBe(false);
});
