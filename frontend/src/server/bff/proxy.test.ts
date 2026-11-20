import { expect, it } from 'vitest';
import { buildUpstreamHeaders, relayHeaders, upstreamUrl } from './proxy';
import { expiredSessionCookie, isSecureRequest, sessionCookie } from './cookies';

function requestWithHeaders(): Request {
  return new Request('http://localhost:3000/api/v1/reservations', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'key-1', Authorization: 'Bearer browser-supplied', 'Content-Type': 'application/json' },
  });
}

it('attaches the JWT from the cookie as a bearer token', () => {
  const headers = buildUpstreamHeaders(requestWithHeaders(), 'jwt-from-cookie', 'req-7');
  expect(headers.get('authorization')).toBe('Bearer jwt-from-cookie');
});

it('forwards idempotency and request ids, ignoring browser-supplied Authorization', () => {
  const headers = buildUpstreamHeaders(requestWithHeaders(), 'jwt-from-cookie', 'req-7');
  expect(headers.get('idempotency-key')).toBe('key-1');
  expect(headers.get('x-request-id')).toBe('req-7');
});

it('relays Retry-After and Idempotent-Replayed', () => {
  const relayed = relayHeaders(new Headers({ 'Retry-After': '3', 'Idempotent-Replayed': 'true' }));
  expect(relayed.get('retry-after')).toBe('3');
  expect(relayed.get('idempotent-replayed')).toBe('true');
});

it('drops set-cookie and hop-by-hop headers', () => {
  const relayed = relayHeaders(new Headers({ 'Set-Cookie': 'x=1', 'Transfer-Encoding': 'chunked' }));
  expect(relayed.has('set-cookie')).toBe(false);
  expect(relayed.has('transfer-encoding')).toBe(false);
});

it('builds the upstream URL from the runtime backend base and encodes segments', () => {
  expect(upstreamUrl(['jameyas', 'abc'], '?page=2')).toMatch(/\/api\/v1\/jameyas\/abc\?page=2$/);
});

it('sets the session cookie httpOnly, SameSite=Lax, and Secure under HTTPS', () => {
  expect(sessionCookie('t', 3600, true)).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 3600 });
});

it('derives Secure from the request protocol unless COOKIE_SECURE overrides it', () => {
  expect(isSecureRequest('https://pokunity.app/login')).toBe(true);
  expect(isSecureRequest('http://localhost:3000/login', {})).toBe(false);
  expect(isSecureRequest('http://localhost:3000/login', { COOKIE_SECURE: 'true' })).toBe(true);
});

it('expires the cookie with matching attributes so the browser drops it', () => {
  expect(expiredSessionCookie(false)).toMatchObject({ value: '', maxAge: 0, httpOnly: true });
});

it('forwards If-None-Match so the backend can answer 304 for unchanged data', () => {
  const request = new Request('http://localhost:3000/api/v1/jameyas', { headers: { 'If-None-Match': '"abc"' } });
  expect(buildUpstreamHeaders(request, 'jwt', 'req-8').get('if-none-match')).toBe('"abc"');
});
