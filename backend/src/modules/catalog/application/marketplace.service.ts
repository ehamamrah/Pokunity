import { Injectable } from '@nestjs/common';
import { LruCache } from '../../../shared/cache/lru';
import { ExperimentAssignment } from '../../analytics/domain/experiments';
import { JameyaListing, JameyaSummary } from '../domain/jameya';
import { buildFilterSpec, ListingFilter } from '../domain/listing-filter';
import { Ranked, SORT_STRATEGIES, SortKey } from '../domain/sort-strategies';
import { CatalogSnapshot, CatalogSnapshotService } from './catalog-snapshot.service';
import { RankingContextFactory, ViewerRanking } from './ranking-context.factory';
import { toSummary } from './summary.presenter';

export interface ListQuery extends ListingFilter {
  sort: SortKey;
  page: number;
  pageSize: number;
}

export interface ListResult {
  data: JameyaSummary[];
  meta: { page: number; pageSize: number; total: number; asOf: string; experiment: ExperimentAssignment };
}

export const FEATURED_LIMIT = 10;

/**
 * Marketplace read side: filter → score → sort → paginate over the shared ≤ 5 s snapshot.
 * The ordered result is memoised per (snapshot version, viewer profile, filters, sort), so paging and
 * polling do not re-rank; reasons/badges are built for the returned page only.
 */
@Injectable()
export class MarketplaceService {
  private readonly rankedCache = new LruCache<string, JameyaListing[]>(512);

  constructor(
    private readonly snapshots: CatalogSnapshotService,
    private readonly rankingFactory: RankingContextFactory,
  ) {}

  async list(userId: string, query: ListQuery): Promise<ListResult> {
    const snapshot = await this.snapshots.get();
    const viewer = await this.rankingFactory.forViewer(userId, snapshot.featuredSet, snapshot.asOf);
    const ranked = this.rankedFor(snapshot, viewer, query);
    const start = (query.page - 1) * query.pageSize;
    const data = ranked.slice(start, start + query.pageSize).map((j) => this.present(j, viewer));
    const { page, pageSize } = query;
    const meta = { page, pageSize, total: ranked.length, asOf: snapshot.asOf.toISOString(), experiment: viewer.experiment };
    return { data, meta };
  }

  async featured(userId: string): Promise<{ data: JameyaSummary[]; meta: { asOf: string } }> {
    const snapshot = await this.snapshots.get();
    const viewer = await this.rankingFactory.forViewer(userId, snapshot.featuredSet, snapshot.asOf);
    const data = snapshot.featuredIds
      .map((id) => snapshot.byId.get(id))
      .filter((j): j is JameyaListing => !!j && j.seatsAvailable > 0)
      .slice(0, FEATURED_LIMIT)
      .map((j) => this.present(j, viewer));
    return { data, meta: { asOf: snapshot.asOf.toISOString() } };
  }

  present(j: JameyaListing, viewer: ViewerRanking): JameyaSummary {
    return toSummary(j, viewer.strategy.rank(j, viewer.context), viewer.context);
  }

  private rankedFor(snapshot: CatalogSnapshot, viewer: ViewerRanking, q: ListQuery): JameyaListing[] {
    const { typicalMonthlyAmount, preferredDurations } = viewer.context;
    const key = [snapshot.version, viewer.experiment.variant, typicalMonthlyAmount, preferredDurations.join('.'),
      q.sort, q.minMonthly, q.maxMonthly, q.duration, q.q?.trim().toLowerCase(), q.availableOnly].join('|');
    const cached = this.rankedCache.get(key);
    if (cached) return cached;
    const ranked = this.rank(snapshot.listings.filter(buildFilterSpec(q)), viewer, q.sort);
    this.rankedCache.set(key, ranked);
    return ranked;
  }

  /** Only the recommended sort needs scores; other sorts use their comparator directly. */
  private rank(matches: JameyaListing[], viewer: ViewerRanking, sort: SortKey): JameyaListing[] {
    const { strategy, context } = viewer;
    const items: Ranked[] = matches.map((jameya) => ({
      jameya, score: sort === 'recommended' ? strategy.score(jameya, context) : 0,
    }));
    return items.sort(SORT_STRATEGIES[sort]).map((r) => r.jameya);
  }
}
