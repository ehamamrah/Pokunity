import { Injectable } from '@nestjs/common';
import { ExperimentAssignment } from '../../analytics/domain/experiments';
import { JameyaListing, JameyaSummary } from '../domain/jameya';
import { buildFilterSpec, ListingFilter } from '../domain/listing-filter';
import { Ranked, SORT_STRATEGIES, SortKey } from '../domain/sort-strategies';
import { CatalogSnapshotService } from './catalog-snapshot.service';
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

/** Marketplace read side: filter → rank → sort → paginate over the ≤5 s snapshot. */
@Injectable()
export class MarketplaceService {
  constructor(
    private readonly snapshots: CatalogSnapshotService,
    private readonly rankingFactory: RankingContextFactory,
  ) {}

  async list(userId: string, query: ListQuery): Promise<ListResult> {
    const snapshot = await this.snapshots.get();
    const viewer = await this.rankingFactory.forViewer(userId, snapshot.featuredIds, snapshot.asOf);
    const matches = snapshot.listings.filter(buildFilterSpec(query));
    const ranked = this.rankAll(matches, viewer, query.sort).sort(SORT_STRATEGIES[query.sort]);
    const start = (query.page - 1) * query.pageSize;
    const data = ranked.slice(start, start + query.pageSize).map((r) => this.present(r.jameya, viewer));
    const { page, pageSize } = query;
    const meta = { page, pageSize, total: matches.length, asOf: snapshot.asOf.toISOString(), experiment: viewer.experiment };
    return { data, meta };
  }

  async featured(userId: string): Promise<{ data: JameyaSummary[]; meta: { asOf: string } }> {
    const snapshot = await this.snapshots.get();
    const viewer = await this.rankingFactory.forViewer(userId, snapshot.featuredIds, snapshot.asOf);
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

  /** Only the recommended sort needs every score; other sorts rank just the returned page. */
  private rankAll(matches: JameyaListing[], viewer: ViewerRanking, sort: SortKey): Ranked[] {
    const scoreOf = (j: JameyaListing) => (sort === 'recommended' ? viewer.strategy.rank(j, viewer.context).score : 0);
    return matches.map((jameya) => ({ jameya, score: scoreOf(jameya) }));
  }
}
