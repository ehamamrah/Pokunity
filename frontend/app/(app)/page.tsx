import { Suspense } from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { KycBanner } from '@/features/auth';
import { MarketplaceView, parseFilters, type QueryReader } from '@/features/marketplace';
import { serverApiClient } from '@/server/bff/server-client';
import { prefetchMarketplace } from '@/server/prefetch/marketplace';
import { createQueryClient } from '@/shared/query';
import { SkeletonCards } from '@/shared/ui';

type SearchParams = Record<string, string | string[] | undefined>;

function readerFor(params: SearchParams): QueryReader {
  return {
    get: (name) => {
      const value = params[name];
      return (Array.isArray(value) ? value[0] : value) ?? null;
    },
  };
}

function MarketplaceShell() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Find your Jameya</h1>
        <p className="mt-1 text-sm text-slate-600">Compare monthly amounts, payout timing and fees before you hold a seat.</p>
      </div>
      <KycBanner />
      <Suspense fallback={<SkeletonCards />}>
        <MarketplaceView />
      </Suspense>
    </div>
  );
}

/** Server component: prefetches in parallel and hydrates, so the first paint already has data. */
export default async function MarketplacePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = parseFilters(readerFor(await searchParams));
  const queryClient = createQueryClient();
  await prefetchMarketplace(queryClient, filters, await serverApiClient());
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MarketplaceShell />
    </HydrationBoundary>
  );
}
