'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { TIMING } from '@/shared/config/timing';
import { queryKeys } from '@/shared/query';
import { nextPageParam } from '../model/paging';
import type { MarketplaceFilters } from '../model/filters';
import { fetchJameyaPage } from './jameya-catalog';

/**
 * Ranked list with infinite pagination. Refetches in the background while visible,
 * and on window focus, so seats-left and badges stay within the contract's 5 s freshness.
 */
export function useJameyaList(filters: MarketplaceFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.jameyas.list(filters),
    queryFn: ({ pageParam }) => fetchJameyaPage(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextPageParam(lastPage.meta),
    staleTime: TIMING.staleTimeMs,
    refetchInterval: TIMING.marketplaceRefetchMs,
    refetchOnWindowFocus: true,
  });
}
