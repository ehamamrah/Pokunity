/**
 * Freshness and polling policy. Values mirror the contract: marketplace reads may be
 * up to 5 s stale; booking and checkout always read the authoritative database.
 */
export const TIMING = {
  /** Marketplace list / featured staleTime (contract: <= 5 s staleness). */
  staleTimeMs: 5_000,
  /** Visible marketplace lists refetch in the background. */
  marketplaceRefetchMs: 12_000,
  /** Seat map polls so seats flip to HELD/TAKEN without a manual refresh. */
  seatMapRefetchMs: 5_000,
  /** Reservation while HELD: detect the server-side sweeper expiring it. */
  holdRefetchMs: 5_000,
  /** Checkout polling (PAYMENT_PENDING): fast window, then back off. */
  checkoutFastPollMs: 1_500,
  checkoutSlowPollMs: 3_000,
  checkoutFastWindowMs: 15_000,
  /** Analytics batching. */
  analyticsFlushMs: 5_000,
  analyticsMaxBatch: 20,
  analyticsHardMax: 50,
  analyticsMaxQueue: 200,
  /** Impression = at least half of the item visible. */
  impressionThreshold: 0.5,
  /** Profile changes rarely; KYC status is re-checked on navigation. */
  meStaleTimeMs: 60_000,
} as const;
