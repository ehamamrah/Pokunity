'use client';

import { useQuery } from '@tanstack/react-query';
import { TIMING } from '@/shared/config/timing';
import { queryKeys } from '@/shared/query';
import { fetchFeatured } from './jameya-catalog';

export function useFeatured() {
  return useQuery({
    queryKey: queryKeys.jameyas.featured(),
    queryFn: fetchFeatured,
    staleTime: TIMING.staleTimeMs,
    refetchInterval: TIMING.marketplaceRefetchMs,
    refetchIntervalInBackground: false,
  });
}
