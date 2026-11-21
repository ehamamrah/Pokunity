export type LoginReason = 'expired' | 'signed_out';

/** Hard navigation (not router.push) so the whole app state, including caches, is discarded. */
export function redirectToLogin(reason: LoginReason): void {
  if (typeof window === 'undefined' || window.location.pathname === '/login') return;
  const params = new URLSearchParams({ reason });
  if (reason === 'expired') params.set('next', `${window.location.pathname}${window.location.search}`);
  window.location.assign(`/login?${params.toString()}`);
}
