import { infiniteQueryOptions, keepPreviousData, queryOptions, type QueryClient } from '@tanstack/react-query';
import { apiClient, withMetaAsOf, withTopLevelAsOf, type ApiClient } from '@/shared/api-client';
import { TIMING } from '@/shared/config/timing';
import { featuredListSchema, jameyaDetailSchema, jameyaListSchema } from '@/shared/contract';
import { queryKeys } from '@/shared/query';
import { toListQuery, type MarketplaceFilters } from '../model/filters';
import { nextPageParam } from '../model/paging';
import type { FeaturedPage, JameyaListPage } from '../model/types';

export const JAMEYA_PAGE_SIZE = 20;

/**
 * Repository for the marketplace read model. The client is injectable so the server can
 * prefetch with the same key and the same function the browser will use (see server/prefetch).
 */
export async function fetchJameyaPage(filters: MarketplaceFilters, page: number, client: ApiClient = apiClient): Promise<JameyaListPage> {
  const { data, headers } = await client.get('/jameyas', jameyaListSchema, { query: toListQuery(filters, page, JAMEYA_PAGE_SIZE) });
  return withMetaAsOf(data, headers);
}

export async function fetchFeatured(client: ApiClient = apiClient): Promise<FeaturedPage> {
  const { data, headers } = await client.get('/jameyas/featured', featuredListSchema);
  return withMetaAsOf(data, headers);
}

export async function fetchJameyaDetail(id: string, client: ApiClient = apiClient) {
  const { data, headers } = await client.get(`/jameyas/${id}`, jameyaDetailSchema);
  return withTopLevelAsOf(data, headers);
}

/** Ranked list. `keepPreviousData` keeps the old results on screen while a filter change loads. */
export function jameyaListOptions(filters: MarketplaceFilters, client: ApiClient = apiClient) {
  return infiniteQueryOptions({
    queryKey: queryKeys.jameyas.list(filters),
    queryFn: ({ pageParam }) => fetchJameyaPage(filters, pageParam, client),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextPageParam(lastPage.meta),
    staleTime: TIMING.staleTimeMs,
    refetchInterval: TIMING.marketplaceRefetchMs,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
}

export function featuredOptions(client: ApiClient = apiClient) {
  return queryOptions({
    queryKey: queryKeys.jameyas.featured(),
    queryFn: () => fetchFeatured(client),
    staleTime: TIMING.staleTimeMs,
    refetchInterval: TIMING.marketplaceRefetchMs,
    refetchIntervalInBackground: false,
  });
}

export function jameyaDetailOptions(id: string, client: ApiClient = apiClient) {
  return queryOptions({
    queryKey: queryKeys.jameyas.detail(id),
    queryFn: () => fetchJameyaDetail(id, client),
    staleTime: TIMING.staleTimeMs,
  });
}

/** Warms the detail on hover or focus, so the click renders from cache. TanStack dedupes and honours staleTime. */
export function prefetchJameya(queryClient: QueryClient, id: string): void {
  void queryClient.prefetchQuery(jameyaDetailOptions(id));
}
