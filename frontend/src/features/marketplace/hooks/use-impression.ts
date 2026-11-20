'use client';

import type { RefObject } from 'react';
import { TIMING } from '@/shared/config/timing';
import { useIntersection } from '@/shared/lib/use-intersection';
import { analytics, type AnalyticsSurface, type ExperimentAssignment, type ImpressionLedger } from '@/features/analytics';

export interface ImpressionTarget {
  jameyaId: string;
  surface: AnalyticsSurface;
  position: number;
  experiment: ExperimentAssignment | null;
}

/** Observer pattern: an impression is logged once per item per page view, at >= 50% visibility. */
export function useImpression(ref: RefObject<Element | null>, target: ImpressionTarget, ledger: ImpressionLedger): void {
  const { jameyaId, surface, position, experiment } = target;
  useIntersection(ref, {
    threshold: TIMING.impressionThreshold,
    onIntersect: () => {
      if (!ledger.record(`${surface}:${jameyaId}`)) return;
      analytics.track({ type: 'impression', jameyaId, surface, position, experiment });
    },
  });
}
