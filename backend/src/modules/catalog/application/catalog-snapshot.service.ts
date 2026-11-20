import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock';
import { JameyaListing } from '../domain/jameya';
import { JameyasRepository } from '../infrastructure/jameyas.repository';

/** Max snapshot age before a reader triggers a refresh; keeps worst-case staleness under 5 s. */
export const SNAPSHOT_MAX_AGE_MS = 4000;

export interface CatalogSnapshot {
  listings: JameyaListing[];
  byId: Map<string, JameyaListing>;
  featuredIds: string[];
  asOf: Date;
}

/**
 * In-memory read model of the marketplace (5k rows ≈ a few MB). Refreshed lazily with
 * single-flight so N concurrent readers trigger one query. The booking path never reads it.
 */
@Injectable()
export class CatalogSnapshotService {
  private readonly logger = new Logger(CatalogSnapshotService.name);
  private snapshot: CatalogSnapshot | null = null;
  private refreshing: Promise<CatalogSnapshot> | null = null;

  constructor(
    private readonly repository: JameyasRepository,
    private readonly clock: Clock,
  ) {}

  async get(): Promise<CatalogSnapshot> {
    const age = this.snapshot ? this.clock.now().getTime() - this.snapshot.asOf.getTime() : Infinity;
    if (this.snapshot && age < SNAPSHOT_MAX_AGE_MS) return this.snapshot;
    this.refreshing ??= this.load().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async load(): Promise<CatalogSnapshot> {
    const asOf = this.clock.now();
    const [listings, featuredIds] = await Promise.all([this.repository.loadListings(), this.repository.loadFeaturedIds()]);
    this.snapshot = { listings, featuredIds, asOf, byId: new Map(listings.map((l) => [l.id, l])) };
    this.logger.debug({ msg: 'catalog snapshot refreshed', rows: listings.length });
    return this.snapshot;
  }
}
