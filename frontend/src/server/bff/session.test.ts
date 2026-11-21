import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';
import { callBackend } from './backend-client';
import { handleLogout, parseLogoutScope } from './session';

vi.mock('./backend-client', () => ({ callBackend: vi.fn(), unavailableResponse: vi.fn() }));
const call = vi.mocked(callBackend);
const URL_ = 'http://localhost:3000/api/session';

function logoutRequest(body: unknown, cookie = 'pokunity_session=tok-123'): NextRequest {
  return new NextRequest(URL_, {
    method: 'DELETE',
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

it('revokes the token at the backend with the requested scope', async () => {
  call.mockResolvedValue({ kind: 'response', response: new Response(null, { status: 204 }) as never });
  await handleLogout(logoutRequest({ allSessions: true }));
  expect(call).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({ method: 'POST', body: JSON.stringify({ allSessions: true }) }));
  const headers = call.mock.calls[0]?.[1].headers;
  expect(headers?.get('authorization')).toBe('Bearer tok-123');
});

it('clears the cookie and the HTTP cache even when the backend is unreachable', async () => {
  call.mockResolvedValue({ kind: 'unavailable' });
  const response = await handleLogout(logoutRequest(undefined));
  expect(response.status).toBe(204);
  expect(response.headers.get('clear-site-data')).toBe('"cache"');
  expect(response.headers.get('set-cookie')).toMatch(/pokunity_session=;.*Max-Age=0/i);
});

it('does not call the backend without a session cookie', async () => {
  await handleLogout(new NextRequest(URL_, { method: 'DELETE' }));
  expect(call).not.toHaveBeenCalled();
});

it.each([
  [{ allSessions: true }, true],
  [{ allSessions: false }, false],
  [{}, false],
  [null, false],
  [{ allSessions: 'yes' }, false],
])('reads the logout scope from %j as all-sessions=%s', (json, expected) => {
  expect(parseLogoutScope(json)).toBe(expected);
});
