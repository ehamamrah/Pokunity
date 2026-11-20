'use client';

import { useQuery } from '@tanstack/react-query';
import { jameyaDetailOptions } from '@/features/marketplace';
import { TIMING } from '@/shared/config/timing';

/** Seat map polls every ~5 s, and only while the tab is visible, so holds placed by others appear without a refresh. */
export function useJameyaDetail(jameyaId: string) {
  return useQuery({
    ...jameyaDetailOptions(jameyaId),
    refetchInterval: TIMING.seatMapRefetchMs,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });
}
