export type LoginReason = 'expired' | 'signed_out';

/** Hard navigation (not router.push) so the whole app state, including caches, is discarded. */
export function redirectToLogin(reason: LoginReason): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  window.location.assign(`/login?reason=${reason}`);
}
