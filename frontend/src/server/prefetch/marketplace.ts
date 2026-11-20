import type { QueryClient } from '@tanstack/react-query';
import { featuredOptions, jameyaListOptions, type MarketplaceFilters } from '@/features/marketplace';
import { meOptions } from '@/features/auth';
import type { ApiClient } from '@/shared/api-client';

/**
 * Warms the marketplace cache on the server in parallel: profile, featured and the first ranked
 * page. The HTML then arrives with the data, so the browser does not start a request waterfall
 * after hydration. prefetchQuery never throws; a failed read simply leaves the client to fetch.
 */
export async function prefetchMarketplace(queryClient: QueryClient, filters: MarketplaceFilters, client: ApiClient): Promise<void> {
  await Promise.all([
    queryClient.prefetchQuery(meOptions(client)),
    queryClient.prefetchQuery(featuredOptions(client)),
    queryClient.prefetchInfiniteQuery(jameyaListOptions(filters, client)),
  ]);
}
