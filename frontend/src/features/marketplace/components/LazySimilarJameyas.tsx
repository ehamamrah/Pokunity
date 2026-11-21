'use client';

import { useRef, useState } from 'react';
import { useIntersection } from '@/shared/lib/use-intersection';
import { SimilarJameyas } from './SimilarJameyas';

/**
 * "You may also like", below the fold. Nothing is fetched until the placeholder scrolls into view,
 * and the placeholder holds its height so the page does not shift when the strip arrives.
 */
export function LazySimilarJameyas({ jameyaId }: { jameyaId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useIntersection(ref, { threshold: 0, enabled: !visible, onIntersect: () => setVisible(true) });
  if (!visible) return <div ref={ref} className="min-h-40" aria-hidden="true" />;
  return <SimilarJameyas jameyaId={jameyaId} heading="You may also like" />;
}
