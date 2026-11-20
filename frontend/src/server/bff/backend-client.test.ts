import { expect, it } from 'vitest';
import { countsAsFailure, unavailableResponse } from './backend-client';

it.each([500, 502, 504])('counts status %i as a backend failure', (status) => {
  expect(countsAsFailure(status)).toBe(true);
});

it.each([200, 201, 400, 401, 403, 409, 422, 503])('does not count status %i against the breaker', (status) => {
  expect(countsAsFailure(status)).toBe(false);
});

it('answers an open circuit with a 503 envelope and Retry-After', () => {
  const response = unavailableResponse({ kind: 'open', retryAfterSeconds: 7 }, 'req-1');
  expect(response?.status).toBe(503);
  expect(response?.headers.get('retry-after')).toBe('7');
  expect(response?.headers.get('x-request-id')).toBe('req-1');
});

it('answers a timeout with 504 and a contract error envelope', async () => {
  const response = unavailableResponse({ kind: 'timeout' }, 'req-2');
  expect(response?.status).toBe(504);
  const body = (await response?.json()) as { error: { code: string; traceId: string } };
  expect(body.error.code).toBe('INTERNAL_ERROR');
  expect(body.error.traceId).toBe('req-2');
});

it('answers an unreachable backend with 503', () => {
  expect(unavailableResponse({ kind: 'unavailable' }, 'req-3')?.status).toBe(503);
});

it('returns null for a backend response, which is relayed rather than mapped', () => {
  expect(unavailableResponse({ kind: 'response', response: new Response(null, { status: 200 }) as never }, 'req-4')).toBeNull();
});
