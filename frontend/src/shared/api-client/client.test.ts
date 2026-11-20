import { expect, it } from 'vitest';
import { z } from 'zod';
import { createApiClient } from './client';
import { ApiError, ContractError, NetworkError } from './errors';
import { parseRetryAfter, toApiError } from './envelope';
import { shouldRetryWrite, writeRetryDelayMs } from './retry';
import type { HttpRequest, HttpResponse, HttpTransport } from './transport';

const ENVELOPE = { error: { code: 'SEAT_UNAVAILABLE', message: 'Seat 11 is no longer available.', details: { seatNumber: 11 }, traceId: 'trace-1' } };

function transportReturning(status: number, body: unknown, headers: Record<string, string> = {}) {
  const sent: HttpRequest[] = [];
  const transport: HttpTransport = {
    send: (request) => {
      sent.push(request);
      const response: HttpResponse = { status, headers: new Headers(headers), body };
      return Promise.resolve(response);
    },
  };
  return { transport, sent };
}

it('maps a contract error body to an ApiError with code, details and trace id', () => {
  const error = toApiError(409, ENVELOPE, new Headers());
  expect(error).toBeInstanceOf(ApiError);
  expect(error.code).toBe('SEAT_UNAVAILABLE');
  expect(error.details).toEqual({ seatNumber: 11 });
  expect(error.traceId).toBe('trace-1');
});

it('falls back to a status-based code for non-contract bodies', () => {
  expect(toApiError(429, 'Too many', new Headers()).code).toBe('RATE_LIMITED');
  expect(toApiError(502, null, new Headers()).code).toBe('INTERNAL_ERROR');
});

it('parses Retry-After as seconds or an HTTP date', () => {
  expect(parseRetryAfter('7')).toBe(7);
  expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT', Date.parse('Wed, 21 Oct 2026 07:27:50 GMT'))).toBe(10);
  expect(parseRetryAfter(null)).toBeNull();
});

it('validates 2xx bodies against the contract schema and rejects drift', async () => {
  const { transport } = transportReturning(200, { unexpected: true });
  const client = createApiClient({ baseUrl: '/api/v1', transport });
  await expect(client.get('/me', z.object({ id: z.string() }))).rejects.toBeInstanceOf(ContractError);
});

it('sends the Idempotency-Key header and a request id on writes', async () => {
  const { transport, sent } = transportReturning(201, { id: 'x' });
  const client = createApiClient({ baseUrl: '/api/v1', transport, createRequestId: () => 'req-1' });
  await client.post('/reservations', z.object({ id: z.string() }), { body: { jameyaId: 'j', seatNumber: 1 }, idempotencyKey: 'key-abc' });
  expect(sent[0]?.headers['Idempotency-Key']).toBe('key-abc');
  expect(sent[0]?.headers['X-Request-Id']).toBe('req-1');
  expect(sent[0]?.body).toBe(JSON.stringify({ jameyaId: 'j', seatNumber: 1 }));
});

it('throws a typed ApiError for non-2xx responses', async () => {
  const { transport } = transportReturning(403, { error: { code: 'KYC_REQUIRED', message: 'x', traceId: 't' } });
  const client = createApiClient({ baseUrl: '/api/v1', transport });
  await expect(client.post('/reservations', z.object({}), { body: {} })).rejects.toMatchObject({ code: 'KYC_REQUIRED' });
});

it('surfaces transport failure as NetworkError', async () => {
  const transport: HttpTransport = { send: () => Promise.reject(new NetworkError()) };
  const client = createApiClient({ baseUrl: '/api/v1', transport });
  await expect(client.get('/me', z.object({}))).rejects.toBeInstanceOf(NetworkError);
});

it('retries only transport loss, in-flight and rate-limit answers, and never business rejections', () => {
  expect(shouldRetryWrite(1, new NetworkError())).toBe(true);
  expect(shouldRetryWrite(1, new ApiError({ status: 409, code: 'IDEMPOTENCY_IN_PROGRESS', message: '' }))).toBe(true);
  expect(shouldRetryWrite(1, new ApiError({ status: 409, code: 'SEAT_UNAVAILABLE', message: '' }))).toBe(false);
  expect(shouldRetryWrite(3, new NetworkError())).toBe(false);
});

it('honors Retry-After before falling back to backoff', () => {
  const limited = new ApiError({ status: 429, code: 'RATE_LIMITED', message: '', retryAfterSeconds: 2 });
  expect(writeRetryDelayMs(1, limited)).toBe(2000);
  const delay = writeRetryDelayMs(2, new NetworkError());
  expect(delay).toBeGreaterThanOrEqual(500);
  expect(delay).toBeLessThanOrEqual(1000);
});
