export interface ImpressionLedger {
  /** Returns true the first time a key is seen in this page view, false afterwards. */
  record(key: string): boolean;
}

/** One ledger per page view: an item is counted as an impression at most once. */
export function createImpressionLedger(): ImpressionLedger {
  const seen = new Set<string>();
  return {
    record(key) {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  };
}
