import { NextResponse, type NextRequest } from 'next/server';
import type { Response as UndiciResponse } from 'undici';
import { createUuid } from '@/shared/lib/uuid';
import { isBlockedPath, requiresSession, SESSION_COOKIE } from './config';
import { callBackend, unavailableResponse, type BackendOutcome } from './backend-client';
import { expiredSessionCookie, isSecureRequest } from './cookies';
import { errorResponse } from './envelope';

/** Hop-by-hop and body-framing headers are not relayed: fetch has already decoded the body. */
const NOT_RELAYED = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding',
  'set-cookie',
  'te',
  'trailer',
  'upgrade',
]);

/** Only these request headers cross the boundary. The browser's own Authorization is ignored. */
const FORWARDED_HEADERS = ['accept', 'content-type', 'idempotency-key', 'if-none-match'] as const;

export function upstreamUrl(segments: readonly string[], search: string): string {
  return `/api/v1/${segments.map(encodeURIComponent).join('/')}${search}`;
}

export function buildUpstreamHeaders(request: Request, token: string | undefined, requestId: string): Headers {
  const headers = new Headers();
  FORWARDED_HEADERS.forEach((name) => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });
  headers.set('x-request-id', requestId);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
}

/** Relays status and headers unchanged (Retry-After, Idempotent-Replayed, X-Request-Id, ...). */
export function relayHeaders(upstream: Headers): Headers {
  const relayed = new Headers();
  upstream.forEach((value, name) => {
    if (!NOT_RELAYED.has(name.toLowerCase())) relayed.set(name, value);
  });
  return relayed;
}

async function readBody(request: NextRequest): Promise<string | undefined> {
  if (request.method === 'GET' || request.method === 'DELETE' || request.method === 'HEAD') return undefined;
  const text = await request.text();
  return text.length > 0 ? text : undefined;
}

async function forward(request: NextRequest, segments: string[], token: string | undefined, requestId: string): Promise<BackendOutcome> {
  return callBackend(upstreamUrl(segments, request.nextUrl.search), {
    method: request.method,
    headers: buildUpstreamHeaders(request, token, requestId),
    body: await readBody(request),
  });
}

/** Expired/invalid JWT at the backend: drop the cookie so the next navigation goes to login. */
function relayUpstream(upstream: UndiciResponse, token: string | undefined, requestId: string, secure: boolean): NextResponse {
  const response = new NextResponse(upstream.body as BodyInit | null, { status: upstream.status, headers: relayHeaders(upstream.headers) });
  if (!response.headers.get('x-request-id')) response.headers.set('x-request-id', requestId);
  if (upstream.status === 401 && token) {
    response.cookies.set(expiredSessionCookie(secure));
  }
  return response;
}

/** Catch-all proxy: attaches the JWT from the httpOnly cookie, never exposes it to the browser. */
export async function proxyRequest(request: NextRequest, segments: string[]): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? createUuid();
  const secure = isSecureRequest(request.url);
  if (isBlockedPath(segments)) return errorResponse(404, 'NOT_FOUND', 'Not found.', requestId);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token && requiresSession(segments)) {
    return errorResponse(401, 'UNAUTHORIZED', 'Please sign in to continue.', requestId);
  }
  const outcome = await forward(request, segments, token, requestId);
  if (outcome.kind === 'response') return relayUpstream(outcome.response, token, requestId, secure);
  return unavailableResponse(outcome, requestId) ?? errorResponse(503, 'INTERNAL_ERROR', 'Service unavailable.', requestId);
}
