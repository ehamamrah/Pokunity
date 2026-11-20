'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { parseFilters, toSearchParams, type MarketplaceFilters } from '../model/filters';

/** Filters live in the URL: shareable, back-button friendly, and survive reloads. */
export function useFilterParams(): { filters: MarketplaceFilters; update: (next: MarketplaceFilters) => void } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const update = useCallback(
    (next: MarketplaceFilters) => {
      const query = toSearchParams(next).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  return { filters, update };
}
