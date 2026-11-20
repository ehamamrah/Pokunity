'use client';

import { TIMING } from '@/shared/config/timing';
import { formatAgo, secondsSince } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/use-now';

/** Honest freshness: shows the server's `asOf`, not the browser's fetch time. */
export function FreshnessIndicator({ asOf }: { asOf: string | null }) {
  const now = useNow(TIMING.staleTimeMs);
  if (!asOf || now === null) return null;
  return (
    <p className="text-xs text-slate-500" aria-live="off">
      Availability updated {formatAgo(secondsSince(asOf, now))}
    </p>
  );
}
