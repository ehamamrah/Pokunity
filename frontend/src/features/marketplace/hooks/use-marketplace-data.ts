'use client';

import { useEffect, useMemo } from 'react';
import { analytics, type ExperimentAssignment } from '@/features/analytics';
import { useFeatured } from '../api/use-featured';
import { useJameyaList } from '../api/use-jameya-list';
import type { RankedJameya } from '../components/JameyaList';
import { positionOf } from '../model/paging';
import type { JameyaListPage } from '../model/types';
import { useFilterParams } from './use-filter-params';

function flattenPages(pages: JameyaListPage[] | undefined): RankedJameya[] {
  return (pages ?? []).flatMap((page) => page.data.map((jameya, index) => ({ jameya, position: positionOf(page.meta, index) })));
}

export interface MarketplaceData {
  filters: ReturnType<typeof useFilterParams>['filters'];
  update: ReturnType<typeof useFilterParams>['update'];
  featured: ReturnType<typeof useFeatured>;
  list: ReturnType<typeof useJameyaList>;
  items: RankedJameya[];
  experiment: ExperimentAssignment | null;
  asOf: string | null;
}

/** Hook: URL filters, featured and ranked queries, and experiment attribution for the page. */
export function useMarketplaceData(): MarketplaceData {
  const { filters, update } = useFilterParams();
  const featured = useFeatured();
  const list = useJameyaList(filters);
  const pages = list.data?.pages;
  const items = useMemo(() => flattenPages(pages), [pages]);
  const experiment: ExperimentAssignment | null = pages?.[0]?.meta.experiment ?? null;
  useEffect(() => {
    analytics.rememberExperiment(experiment);
  }, [experiment]);
  return { filters, update, featured, list, items, experiment, asOf: pages?.[0]?.meta.asOf ?? null };
}
