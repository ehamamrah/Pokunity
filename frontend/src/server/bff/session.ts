import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createUuid } from '@/shared/lib/uuid';
import { errorEnvelopeSchema, loginResponseSchema } from '@/shared/contract';
import { backendBaseUrl } from './config';
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

async function callBackendLogin(credentials: z.infer<typeof loginBodySchema>, requestId: string): Promise<Response> {
  return fetch(`${backendBaseUrl()}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
    body: JSON.stringify(credentials),
    cache: 'no-store',
  });
}

/** Relays a backend error only when it is a contract envelope; anything else becomes a typed error. */
function passThroughError(upstream: Response, bodyText: string, requestId: string): NextResponse {
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
  try {
    const upstream = await callBackendLogin(credentials, requestId);
    const text = await upstream.text();
    if (!upstream.ok) return passThroughError(upstream, text, requestId);
    return issueSession(parseJson(text), request, requestId);
  } catch {
    return errorResponse(503, 'INTERNAL_ERROR', 'Sign-in is temporarily unavailable. Please try again.', requestId);
  }
}

function issueSession(payload: unknown, request: NextRequest, requestId: string): NextResponse {
  const session = loginResponseSchema.safeParse(payload);
  if (!session.success) return errorResponse(502, 'INTERNAL_ERROR', 'Unexpected response from the authentication service.', requestId);
  const { accessToken, expiresIn, user } = session.data;
  const response = NextResponse.json({ user, expiresIn }, { status: 200, headers: { 'x-request-id': requestId } });
  response.cookies.set(sessionCookie(accessToken, expiresIn, isSecureRequest(request.url)));
  return response;
}

/** DELETE /api/session. The JWT is stateless, so logout means dropping the cookie. */
export function handleLogout(request: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(expiredSessionCookie(isSecureRequest(request.url)));
  return response;
}
