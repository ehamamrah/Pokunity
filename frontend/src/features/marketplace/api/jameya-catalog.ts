import { apiClient } from '@/shared/api-client';
import { featuredListSchema, jameyaListSchema } from '@/shared/contract';
import type { MarketplaceFilters } from '../model/filters';
import { toListQuery } from '../model/filters';
import type { FeaturedPage, JameyaListPage } from '../model/types';

export const JAMEYA_PAGE_SIZE = 20;

/** Repository for the marketplace read model (GET /jameyas, GET /jameyas/featured). */
export async function fetchJameyaPage(filters: MarketplaceFilters, page: number): Promise<JameyaListPage> {
  const { data } = await apiClient.get('/jameyas', jameyaListSchema, {
    query: toListQuery(filters, page, JAMEYA_PAGE_SIZE),
  });
  return data;
}

export async function fetchFeatured(): Promise<FeaturedPage> {
  const { data } = await apiClient.get('/jameyas/featured', featuredListSchema);
  return data;
}
