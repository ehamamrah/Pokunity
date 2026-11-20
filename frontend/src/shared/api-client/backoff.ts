import { isApiError } from './errors';

const BASE_MS = 500;
const CAP_MS = 4_000;
const MAX_RETRY_AFTER_MS = 30_000;

/**
 * Retry delay in ms. `attempt` starts at 1. A server Retry-After wins (capped at 30 s, so a
 * hostile header cannot park the UI). Otherwise exponential backoff with equal jitter: half the
 * ceiling is fixed and half is random, so many clients recovering together do not retry in lockstep.
 */
export function backoffDelayMs(attempt: number, error: unknown, random: () => number = Math.random): number {
  if (isApiError(error) && error.retryAfterSeconds !== null) {
    return Math.min(error.retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const ceiling = Math.min(CAP_MS, BASE_MS * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
