import { isApiError, isNetworkError } from './errors';
import { backoffDelayMs } from './backoff';

export const MAX_WRITE_RETRIES = 2;

/**
 * Writes are retried only when the request was not definitively rejected:
 * network loss, a request still in flight elsewhere, rate limiting, or a 5xx.
 * Business rejections (409 SEAT_UNAVAILABLE, 403 KYC_REQUIRED, ...) are never retried.
 */
export function isAutoRetryableWrite(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  if (!isApiError(error)) return false;
  return (
    error.code === 'IDEMPOTENCY_IN_PROGRESS' ||
    error.code === 'RATE_LIMITED' ||
    error.code === 'INTERNAL_ERROR' ||
    error.code === 'SERVICE_UNAVAILABLE' ||
    error.code === 'UPSTREAM_TIMEOUT'
  );
}

/** TanStack `retry` signature: `failureCount` is the number of failures so far. */
export function shouldRetryWrite(failureCount: number, error: unknown): boolean {
  return failureCount <= MAX_WRITE_RETRIES && isAutoRetryableWrite(error);
}

/** Honors Retry-After when present, otherwise jittered exponential backoff (see backoff.ts). */
export function writeRetryDelayMs(failureCount: number, error: unknown): number {
  return backoffDelayMs(failureCount, error);
}
