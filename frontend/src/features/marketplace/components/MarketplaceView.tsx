'use client';

import { isApiError } from '@/shared/api-client';
import { Alert, EmptyState, SkeletonCards } from '@/shared/ui';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { useMarketplaceData, type MarketplaceData } from '../hooks/use-marketplace-data';
import { countActiveFilters, type MarketplaceFilters } from '../model/filters';
import { FeaturedCarousel } from './FeaturedCarousel';
import { FilterBar } from './FilterBar';
import { FreshnessIndicator } from './FreshnessIndicator';
import { InfiniteSentinel } from './InfiniteSentinel';
import { JameyaList } from './JameyaList';

function listErrorCopy(error: unknown): string {
  if (isApiError(error) && error.code === 'VALIDATION_ERROR') return 'One of the filters is not valid. Reset the filters and try again.';
  return 'Check your connection and try again. Your filters are kept.';
}

function ListBody({ data }: { data: MarketplaceData }) {
  if (data.list.isPending) return <SkeletonCards />;
  if (data.list.isError) return <Alert tone="danger" title="We could not load Jameyas">{listErrorCopy(data.list.error)}</Alert>;
  if (data.items.length === 0) {
    return <EmptyState title="No Jameyas match these filters">Try a wider monthly range, another duration, or include full Jameyas.</EmptyState>;
  }
  return (
    <ErrorBoundary label="Jameya list">
      <JameyaList items={data.items} experiment={data.experiment} />
    </ErrorBoundary>
  );
}

function RecommendedHeader({ filters, asOf }: { filters: MarketplaceFilters; asOf: string | null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id="recommended-heading" className="text-lg font-semibold text-slate-900">Recommended for you</h2>
        <FreshnessIndicator asOf={asOf} />
      </div>
      <p className="text-sm text-slate-500">{countActiveFilters(filters)} filters applied</p>
    </div>
  );
}

function FeaturedSection({ data }: { data: MarketplaceData }) {
  return (
    <ErrorBoundary label="Featured Jameyas">
      <FeaturedCarousel items={data.featured.data?.data} loading={data.featured.isPending} experiment={data.experiment} />
    </ErrorBoundary>
  );
}

/** Container: composes the featured carousel, filters and infinite list. Data lives in useMarketplaceData. */
export function MarketplaceView() {
  const data = useMarketplaceData();
  return (
    <div className="space-y-8">
      <FeaturedSection data={data} />
      <section aria-labelledby="recommended-heading" className="space-y-4">
        <RecommendedHeader filters={data.filters} asOf={data.asOf} />
        <FilterBar filters={data.filters} onApply={data.update} />
        <ListBody data={data} />
        <InfiniteSentinel hasMore={data.list.hasNextPage} loading={data.list.isFetchingNextPage} onLoadMore={() => void data.list.fetchNextPage()} />
      </section>
    </div>
  );
}
