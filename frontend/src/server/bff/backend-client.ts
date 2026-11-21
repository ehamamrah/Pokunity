import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from 'undici';
import { CircuitBreaker } from './circuit-breaker';
import { errorResponse } from './envelope';
import { backendBaseUrl } from './config';
import type { NextResponse } from 'next/server';

/** Upper bound for one backend call; longer than this is reported as 504. */
export const BACKEND_TIMEOUT_MS = 10_000;

/** Keep-alive pool: reuse TCP connections to the backend instead of reconnecting per request. */
const pool = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 60_000, connections: 128 });

/** Shared by every BFF route so a sick backend is detected once, not per request. */
export const backendBreaker = new CircuitBreaker({ failureThreshold: 5, openMs: 10_000 });

export type BackendOutcome =
  | { kind: 'response'; response: UndiciResponse }
  | { kind: 'timeout' }
  | { kind: 'unavailable' }
  | { kind: 'open'; retryAfterSeconds: number };

/** 500/502/504 mean the backend itself is unhealthy. 503 is also used for KYC_UNAVAILABLE, a domain answer, so it does not trip the breaker. */
export function countsAsFailure(status: number): boolean {
  return status === 500 || status === 502 || status === 504;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export interface BackendRequest {
  method: string;
  headers: Headers;
  body?: string;
}

function fetchBackend(path: string, request: BackendRequest): Promise<UndiciResponse> {
  return undiciFetch(`${backendBaseUrl()}${path}`, {
    method: request.method,
    headers: Object.fromEntries(request.headers),
    body: request.body,
    dispatcher: pool,
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    redirect: 'manual',
  });
}

/** Every backend call goes through here: breaker admission, keep-alive pool, timeout, breaker accounting. */
export async function callBackend(path: string, request: BackendRequest): Promise<BackendOutcome> {
  if (!backendBreaker.acquire()) return { kind: 'open', retryAfterSeconds: backendBreaker.retryAfterSeconds() };
  try {
    const response = await fetchBackend(path, request);
    backendBreaker.record(!countsAsFailure(response.status));
    return { kind: 'response', response };
  } catch (error) {
    backendBreaker.record(false);
    return isTimeout(error) ? { kind: 'timeout' } : { kind: 'unavailable' };
  }
}

/** Maps a non-response outcome onto the contract error envelope (503 + Retry-After, or 504). */
export function unavailableResponse(outcome: BackendOutcome, requestId: string): NextResponse | null {
  if (outcome.kind === 'open') {
    return errorResponse(503, 'SERVICE_UNAVAILABLE', 'The service is recovering. Please try again shortly.', requestId, {
      'Retry-After': String(outcome.retryAfterSeconds),
    });
  }
  if (outcome.kind === 'timeout') {
    return errorResponse(504, 'UPSTREAM_TIMEOUT', 'The service took too long to respond. Please try again.', requestId);
  }
  if (outcome.kind === 'unavailable') {
    return errorResponse(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable. Please try again.', requestId);
  }
  return null;
}
