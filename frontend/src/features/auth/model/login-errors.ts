import { isApiError, isNetworkError } from '@/shared/api-client';

/** Strategy: maps a login failure to user-facing copy. Never shows raw server text. */
export function describeLoginError(error: unknown): string {
  if (isNetworkError(error)) return 'We could not reach Pokunity. Check your connection and try again.';
  if (!isApiError(error)) return 'Something went wrong. Please try again.';
  if (error.code === 'INVALID_CREDENTIALS') return 'That email and password do not match. Check them and try again.';
  if (error.code === 'RATE_LIMITED') {
    const wait = error.retryAfterSeconds ?? 60;
    return `Too many sign-in attempts. Wait ${wait} seconds before trying again.`;
  }
  return 'We could not sign you in right now. Please try again shortly.';
}

export function describeSessionReason(reason: string | undefined): string | null {
  if (reason === 'expired') return 'Your session ended. Please sign in again to continue.';
  if (reason === 'signed_out') return 'You have signed out.';
  return null;
}
