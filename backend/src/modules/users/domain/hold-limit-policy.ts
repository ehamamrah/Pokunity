export const DEFAULT_MAX_ACTIVE_HOLDS = 3;
export const PENALIZED_MAX_ACTIVE_HOLDS = 1;
/** Members who let this many holds expire are limited to one concurrent hold (anti-hoarding). */
export const EXPIRED_HOLDS_PENALTY_THRESHOLD = 3;

export function maxActiveHolds(expiredHoldsCount: number): number {
  return expiredHoldsCount >= EXPIRED_HOLDS_PENALTY_THRESHOLD
    ? PENALIZED_MAX_ACTIVE_HOLDS
    : DEFAULT_MAX_ACTIVE_HOLDS;
}
