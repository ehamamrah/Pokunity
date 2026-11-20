'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { MarketplaceFilters } from '../model/filters';
import { jameyaListOptions } from './jameya-catalog';

/** Ranked list with infinite pagination. Options are shared with the server prefetch, so the first page is already cached. */
export function useJameyaList(filters: MarketplaceFilters) {
  return useInfiniteQuery(jameyaListOptions(filters));
}
