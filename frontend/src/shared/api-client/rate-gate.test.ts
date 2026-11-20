import { expect, it, vi } from 'vitest';
import { createApiClient } from './client';
import { ApiError } from './errors';
import { RateGate } from './rate-gate';
import type { HttpResponse, HttpTransport } from './transport';
import { z } from 'zod';

const OK = z.object({ ok: z.boolean() });

function transportWith(status: number, headers: Record<string, string> = {}) {
  const send = vi.fn((): Promise<HttpResponse> => Promise.resolve({ status, headers: new Headers(headers), body: status === 200 ? { ok: true } : { error: { code: 'RATE_LIMITED', message: '', traceId: 't' } } }));
  const transport: HttpTransport = { send };
  return { transport, send };
}

it('closes the write gate after a 429 and holds the next write locally', async () => {
  let clock = 0;
  const gate = new RateGate(() => clock);
  const { transport, send } = transportWith(429, { 'Retry-After': '5' });
  const client = createApiClient({ baseUrl: '/api/v1', transport, gate });
  await expect(client.post('/reservations', OK, { body: {} })).rejects.toBeInstanceOf(ApiError);
  await expect(client.post('/reservations', OK, { body: {} })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 5 });
  expect(send).toHaveBeenCalledTimes(1);
  clock = 5_000;
  expect(gate.remainingSeconds()).toBe(0);
});

it('never gates reads, so browsing keeps working during a write back-off', async () => {
  const gate = new RateGate(() => 0);
  gate.close(30);
  const { transport, send } = transportWith(200);
  const client = createApiClient({ baseUrl: '/api/v1', transport, gate });
  await client.get('/jameyas', OK);
  expect(send).toHaveBeenCalledTimes(1);
});
