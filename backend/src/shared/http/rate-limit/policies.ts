export type RateLimitSubject = 'ip' | 'user' | 'email';

export interface RateLimitPolicy {
  name: string;
  limit: number;
  windowSeconds: number;
  by: RateLimitSubject;
}

/** Single source of truth for per-route limits (documented in docs/performance/backend.md). */
export const RateLimits = {
  loginPerIp: { name: 'login-ip', limit: 5, windowSeconds: 60, by: 'ip' },
  loginPerEmail: { name: 'login-email', limit: 10, windowSeconds: 900, by: 'email' },
  reservationCreate: { name: 'reservation-create', limit: 5, windowSeconds: 10, by: 'user' },
  reservationCheckout: { name: 'reservation-checkout', limit: 10, windowSeconds: 60, by: 'user' },
  reservationCancel: { name: 'reservation-cancel', limit: 10, windowSeconds: 10, by: 'user' },
  reservationPoll: { name: 'reservation-poll', limit: 60, windowSeconds: 10, by: 'user' },
  reservationList: { name: 'reservation-list', limit: 30, windowSeconds: 10, by: 'user' },
  events: { name: 'events', limit: 60, windowSeconds: 10, by: 'user' },
  webhook: { name: 'webhook', limit: 300, windowSeconds: 10, by: 'ip' },
} as const satisfies Record<string, RateLimitPolicy>;
