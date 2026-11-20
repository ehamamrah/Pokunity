import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { TIMING } from '../config/timing';
import { backoffDelayMs } from '../api-client/backoff';
import { isApiError, isNetworkError } from '../api-client/errors';
import { redirectToLogin } from '../lib/navigation';

const MAX_READ_RETRIES = 2;

/** Reads retry on transport loss, 429 and 5xx only; contract 4xx answers are final. */
export function shouldRetryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_READ_RETRIES) return false;
  if (isNetworkError(error)) return true;
  return isApiError(error) && (error.status === 429 || error.status >= 500);
}

/** A 401 anywhere means the JWT expired: send the user to login (session expiry). */
export function handleGlobalError(error: unknown): void {
  if (isApiError(error) && error.code === 'UNAUTHORIZED') redirectToLogin('expired');
}

/** Per-resource caching and polling policy lives in each feature's hook; these are the defaults. */
const QUERY_DEFAULTS = {
  staleTime: TIMING.staleTimeMs,
  refetchOnWindowFocus: true,
  retry: shouldRetryRead,
  retryDelay: (failureCount: number, error: unknown) => backoffDelayMs(failureCount, error),
  // Polling pauses while the tab is hidden; focus or visibility triggers an immediate refetch.
  refetchIntervalInBackground: false,
  gcTime: 5 * 60_000,
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleGlobalError }),
    mutationCache: new MutationCache({ onError: handleGlobalError }),
    defaultOptions: { queries: QUERY_DEFAULTS },
  });
}
