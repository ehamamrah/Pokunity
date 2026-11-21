import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';
import { proxyRequest } from './proxy';

/**
 * Regression guard: Next.js strips Content-Encoding from route-handler responses, so the BFF
 * must never encode the body itself. A gzipped body without the header is unreadable for browsers.
 */
const PAYLOAD = { data: [{ id: 'j1' }], meta: { page: 1 } };

vi.mock('./backend-client', () => ({
  callBackend: () => Promise.resolve({ kind: 'response', response: upstreamJson() }),
  unavailableResponse: () => new Response(null, { status: 503 }),
}));

function upstreamJson(): Response {
  const headers = { 'content-type': 'application/json', 'content-encoding': 'gzip' };
  return new Response(JSON.stringify(PAYLOAD), { status: 200, headers });
}

function gzipAcceptingRequest(): NextRequest {
  const headers = { 'accept-encoding': 'gzip, deflate, br', cookie: 'pokunity_session=t' };
  return new NextRequest('http://localhost:3000/api/v1/jameyas', { headers });
}

it('relays a plain, readable body and no Content-Encoding even when the browser accepts gzip', async () => {
  const response = await proxyRequest(gzipAcceptingRequest(), ['jameyas']);
  expect(response.headers.get('content-encoding')).toBeNull();
  expect(await response.json()).toEqual(PAYLOAD);
});
