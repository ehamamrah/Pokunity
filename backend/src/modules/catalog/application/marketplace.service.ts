import { Injectable } from '@nestjs/common';
import { LruCache } from '../../../shared/cache/lru';
import { Errors } from '../../../shared/errors/app-error';
import { Conditional, conditionalFromInputs } from '../../../shared/http/conditional';
import { JameyaListing, JameyaSummary } from '../domain/jameya';
import { buildFilterSpec, ListingFilter } from '../domain/listing-filter';
import { findSimilar } from '../domain/similarity';
import { Ranked, SORT_STRATEGIES, SortKey } from '../domain/sort-strategies';
import { CatalogSnapshot, CatalogSnapshotService } from './catalog-snapshot.service';
import { RankingContextFactory, ViewerRanking } from './ranking-context.factory';
import { toSummary } from './summary.presenter';

export interface ListQuery extends ListingFilter {
  sort: SortKey;
  page: number;
  pageSize: number;
}

export const FEATURED_LIMIT = 10;

/** Everything about the viewer that changes a marketplace response (part of every list ETag). */
function viewerInputs(v: ViewerRanking): unknown[] {
  return [v.experiment.key, v.experiment.variant, v.context.typicalMonthlyAmount, v.context.preferredDurations];
}

/**
 * Marketplace read side over the shared ≤ 5 s snapshot. Each read returns a `Conditional` whose ETag
 * is derived from (snapshot content hash, viewer inputs, query): a revalidation that matches costs
 * no ranking and no serialisation. Ordered results are memoised per (snapshot, viewer, query).
 */
@Injectable()
export class MarketplaceService {
  private readonly rankedCache = new LruCache<string, JameyaListing[]>(512);

  constructor(
    private readonly snapshots: CatalogSnapshotService,
    private readonly rankingFactory: RankingContextFactory,
  ) {}

  async list(userId: string, query: ListQuery): Promise<Conditional> {
    const { snapshot, viewer } = await this.load(userId);
    const queryKey = [query.sort, query.minMonthly, query.maxMonthly, query.duration, query.q?.trim().toLowerCase(), query.availableOnly];
    const inputs = [snapshot.contentHash, ...viewerInputs(viewer), 'list', ...queryKey, query.page, query.pageSize];
    return conditionalFromInputs(inputs, snapshot.asOf, () => {
      const ranked = this.rankedFor(snapshot, viewer, query, queryKey.join('|'));
      const start = (query.page - 1) * query.pageSize;
      const data = ranked.slice(start, start + query.pageSize).map((j) => this.present(j, viewer));
      const meta = { page: query.page, pageSize: query.pageSize, total: ranked.length, asOf: snapshot.asOf.toISOString(), experiment: viewer.experiment };
      return { data, meta };
    });
  }

  async featured(userId: string): Promise<Conditional> {
    const { snapshot, viewer } = await this.load(userId);
    return conditionalFromInputs([snapshot.contentHash, ...viewerInputs(viewer), 'featured'], snapshot.asOf, () => {
      const data = snapshot.featuredIds
        .map((id) => snapshot.byId.get(id))
        .filter((j): j is JameyaListing => !!j && j.seatsAvailable > 0)
        .slice(0, FEATURED_LIMIT)
        .map((j) => this.present(j, viewer));
      return { data, meta: { asOf: snapshot.asOf.toISOString() } };
    });
  }

  /** Candidates always come from the snapshot; only a target newer than the snapshot is read from the DB. */
  async similar(userId: string, jameyaId: string): Promise<Conditional> {
    const { snapshot, viewer } = await this.load(userId);
    const target = await this.snapshots.listingOf(snapshot, jameyaId);
    if (!target) throw Errors.notFound('Jameya');
    return conditionalFromInputs([snapshot.contentHash, ...viewerInputs(viewer), 'similar', jameyaId], snapshot.asOf, () => {
      const matches = findSimilar(target, snapshot.listings, (j) => viewer.strategy.score(j, viewer.context));
      return { data: matches.map((j) => this.present(j, viewer)), meta: { asOf: snapshot.asOf.toISOString(), experiment: viewer.experiment } };
    });
  }

  present(j: JameyaListing, viewer: ViewerRanking): JameyaSummary {
    return toSummary(j, viewer.strategy.rank(j, viewer.context), viewer.context);
  }

  private async load(userId: string): Promise<{ snapshot: CatalogSnapshot; viewer: ViewerRanking }> {
    const snapshot = await this.snapshots.get();
    return { snapshot, viewer: await this.rankingFactory.forViewer(userId, snapshot.featuredSet, snapshot.asOf) };
  }

  private rankedFor(snapshot: CatalogSnapshot, viewer: ViewerRanking, q: ListQuery, queryKey: string): JameyaListing[] {
    const key = [snapshot.version, ...viewerInputs(viewer), queryKey].join('|');
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
