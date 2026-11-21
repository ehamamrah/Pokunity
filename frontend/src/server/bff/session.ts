import { NextResponse, type NextRequest } from 'next/server';
import type { Response as UndiciResponse } from 'undici';
import { z } from 'zod';
import { createUuid } from '@/shared/lib/uuid';
import { errorEnvelopeSchema, loginResponseSchema } from '@/shared/contract';
import { callBackend, unavailableResponse } from './backend-client';
import { SESSION_COOKIE } from './config';
import { expiredSessionCookie, isSecureRequest, sessionCookie } from './cookies';
import { errorResponse } from './envelope';
import { relayHeaders } from './proxy';

const loginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

async function parseCredentials(request: NextRequest): Promise<z.infer<typeof loginBodySchema> | null> {
  const json: unknown = await request.json().catch(() => null);
  const parsed = loginBodySchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

function callBackendLogin(credentials: z.infer<typeof loginBodySchema>, requestId: string) {
  return callBackend('/api/v1/auth/login', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', 'x-request-id': requestId }),
    body: JSON.stringify(credentials),
  });
}

async function relayLogin(upstream: UndiciResponse, request: NextRequest, requestId: string): Promise<NextResponse> {
  const text = await upstream.text();
  if (upstream.status < 200 || upstream.status >= 300) return passThroughError(upstream, text, requestId);
  return issueSession(parseJson(text), request, requestId);
}

/** Relays a backend error only when it is a contract envelope; anything else becomes a typed error. */
function passThroughError(upstream: UndiciResponse, bodyText: string, requestId: string): NextResponse {
  const isEnvelope = errorEnvelopeSchema.safeParse(parseJson(bodyText)).success;
  if (!isEnvelope) return errorResponse(upstream.status, 'INTERNAL_ERROR', 'Sign-in failed.', requestId);
  return new NextResponse(bodyText, { status: upstream.status, headers: relayHeaders(upstream.headers) });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * POST /api/session. Exchanges credentials for a JWT on the server, stores it in an httpOnly,
 * SameSite=Lax cookie, and returns only the user. The token never appears in the body.
 */
export async function handleLogin(request: NextRequest): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? createUuid();
  const credentials = await parseCredentials(request);
  if (!credentials) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Enter a valid email and a password of at least 8 characters.', requestId);
  }
  const outcome = await callBackendLogin(credentials, requestId);
  if (outcome.kind !== 'response') return unavailableResponse(outcome, requestId) ?? errorResponse(503, 'SERVICE_UNAVAILABLE', 'Sign-in is unavailable.', requestId);
  return relayLogin(outcome.response, request, requestId);
}

function issueSession(payload: unknown, request: NextRequest, requestId: string): NextResponse {
  const session = loginResponseSchema.safeParse(payload);
  if (!session.success) return errorResponse(502, 'INTERNAL_ERROR', 'Unexpected response from the authentication service.', requestId);
  const { accessToken, expiresIn, user } = session.data;
  const response = NextResponse.json({ user, expiresIn }, { status: 200, headers: { 'x-request-id': requestId } });
  response.cookies.set(sessionCookie(accessToken, expiresIn, isSecureRequest(request.url)));
  return response;
}

/** Reads the optional `{ allSessions }` body. Anything else means "this session only". */
export function parseLogoutScope(json: unknown): boolean {
  const parsed = z.object({ allSessions: z.boolean().optional() }).safeParse(json);
  return parsed.success && parsed.data.allSessions === true;
}

function logRevocationFailure(requestId: string, reason: string): void {
  // Never log the token. The cookie is cleared regardless, so the failure is operational, not user-facing.
  console.warn(`[bff] logout: backend revocation not confirmed (${reason}) requestId=${requestId}`);
}

/** Asks the backend to revoke the token. 204 and 401 (already revoked) both mean the token is dead. */
async function revokeAtBackend(token: string, allSessions: boolean, requestId: string): Promise<void> {
  const outcome = await callBackend('/api/v1/auth/logout', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-request-id': requestId }),
    body: JSON.stringify({ allSessions }),
  });
  if (outcome.kind !== 'response') return logRevocationFailure(requestId, outcome.kind);
  await outcome.response.arrayBuffer().catch(() => undefined);
  if (outcome.response.status !== 204 && outcome.response.status !== 401) {
    logRevocationFailure(requestId, `HTTP ${outcome.response.status}`);
  }
  return undefined;
}

/**
 * DELETE /api/session. Revokes the token at the backend (best effort), then always clears the cookie
 * and asks the browser to drop its HTTP cache, so the next sign-in cannot see this member's responses.
 */
export async function handleLogout(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get('x-request-id') ?? createUuid();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const json: unknown = await request.json().catch(() => null);
  if (token) await revokeAtBackend(token, parseLogoutScope(json), requestId);
  const response = new NextResponse(null, { status: 204, headers: { 'x-request-id': requestId, 'Clear-Site-Data': '"cache"' } });
  response.cookies.set(expiredSessionCookie(isSecureRequest(request.url)));
  return response;
}
