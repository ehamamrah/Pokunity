'use client';

import { useRef } from 'react';
import { useIntersection } from '@/shared/lib/use-intersection';
import { Button } from '@/shared/ui';

interface InfiniteSentinelProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

/** Infinite scroll with a visible button fallback, so keyboard and reduced-motion users can paginate. */
export function InfiniteSentinel({ hasMore, loading, onLoadMore }: InfiniteSentinelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useIntersection(ref, { threshold: 0.1, enabled: hasMore && !loading, onIntersect: onLoadMore });
  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex justify-center py-6">
      <Button variant="secondary" onClick={onLoadMore} disabled={loading}>
        {loading ? 'Loading more Jameyas…' : 'Load more Jameyas'}
      </Button>
    </div>
  );
}
