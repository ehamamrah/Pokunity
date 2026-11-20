import dynamic from 'next/dynamic';
import { SkeletonCards } from '@/shared/ui';

/** Lazy: the marketplace view (carousel, filters, infinite list) is its own chunk, so other features that import this index do not load it. */
export const MarketplaceView = dynamic(() => import('./components/MarketplaceView').then((module) => module.MarketplaceView), {
  loading: () => <SkeletonCards />,
});
export { JameyaBadges } from './components/JameyaBadges';
export { JameyaFacts } from './components/JameyaFacts';
export { SeatsLeft } from './components/SeatsLeft';
export { fetchJameyaPage, featuredOptions, jameyaDetailOptions, jameyaListOptions, prefetchJameya, JAMEYA_PAGE_SIZE } from './api/jameya-catalog';
export { parseFilters, type QueryReader } from './model/filters';
export { toSearchParams, DEFAULT_FILTERS, type MarketplaceFilters } from './model/filters';
export { describeBadge, seatsLeftLabel } from './model/badges';
