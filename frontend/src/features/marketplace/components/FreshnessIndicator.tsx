'use client';

import { TIMING } from '@/shared/config/timing';
import { formatAgo, secondsSince } from '@/shared/lib/time';
import { useNow } from '@/shared/lib/use-now';

/** Honest freshness: shows the server's `asOf`, not the browser's fetch time. The line is always reserved so the layout does not shift. */
export function FreshnessIndicator({ asOf }: { asOf: string | null }) {
  const now = useNow(TIMING.staleTimeMs);
  const text = asOf && now !== null ? `Availability updated ${formatAgo(secondsSince(asOf, now))}` : '';
  return (
    <p className="min-h-4 text-xs text-slate-500" aria-live="off">
      {text}
    </p>
  );
}
