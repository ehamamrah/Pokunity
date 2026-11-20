'use client';

import { useQuery } from '@tanstack/react-query';
import { TIMING } from '@/shared/config/timing';
import { queryKeys } from '@/shared/query';
import { fetchJameyaDetail } from './jameya-detail-repository';

/** Seat map polls every ~5 s so holds placed by others appear without a manual refresh. */
export function useJameyaDetail(jameyaId: string) {
  return useQuery({
    queryKey: queryKeys.jameyas.detail(jameyaId),
    queryFn: () => fetchJameyaDetail(jameyaId),
    staleTime: TIMING.staleTimeMs,
    refetchInterval: TIMING.seatMapRefetchMs,
    refetchOnWindowFocus: true,
  });
}
