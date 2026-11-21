import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { TwoTierCache } from '../../../shared/cache/two-tier-cache';
import { Clock } from '../../../shared/clock/clock';
import { JameyaListing } from '../domain/jameya';
import { baseSignalsOf } from '../domain/ranking/signals';
import { JameyasRepository } from '../infrastructure/jameyas.repository';

export const SNAPSHOT_KEY = 'mkt:snapshot:v3';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** L1 1 s + L2 3 s (±jitter) keeps the worst-case age of a response below the contract's 5 s. */
export const SNAPSHOT_POLICY = { key: SNAPSHOT_KEY, l1Ms: 1000, l2Ms: 3000, lockMs: 2000 };

interface StoredSnapshot {
  asOf: string;
  /** Hash of everything a viewer can see, EXCLUDING asOf: unchanged data ⇒ unchanged hash. */
  contentHash: string;
  listings: JameyaListing[];
  featuredIds: string[];
}

export interface CatalogSnapshot {
  version: string;
  contentHash: string;
  asOf: Date;
  listings: JameyaListing[];
  byId: Map<string, JameyaListing>;
  featuredIds: string[];
  featuredSet: ReadonlySet<string>;
}

/**
 * Marketplace read model shared by all instances through the two-tier cache. Exactly one instance
 * rebuilds it at a time (Redis refresh lock); base ranking signals are precomputed during the
 * rebuild, so requests only add the personal part. The booking path never reads it.
 */
@Injectable()
export class CatalogSnapshotService {
  private readonly materialized = new WeakMap<StoredSnapshot, CatalogSnapshot>();

  constructor(
    private readonly repository: JameyasRepository,
    private readonly cache: TwoTierCache,
    private readonly clock: Clock,
  ) {}

  async get(): Promise<CatalogSnapshot> {
    const stored = await this.cache.get(SNAPSHOT_POLICY, () => this.build());
    const known = this.materialized.get(stored);
    if (known) return known;
    const snapshot = materialize(stored);
    this.materialized.set(stored, snapshot);
    return snapshot;
  }

  /**
   * A listing by id: from the snapshot, or (for a Jameya created after the snapshot was built, i.e.
   * within the last few seconds) one indexed row from PostgreSQL. null = no such Jameya.
   */
  async listingOf(snapshot: CatalogSnapshot, id: string): Promise<JameyaListing | null> {
    const cached = snapshot.byId.get(id);
    if (cached || !UUID.test(id)) return cached ?? null;
    const map = await this.repository.loadSeatMap(id);
    return map ? { ...map.jameya, base: baseSignalsOf(map.jameya, this.clock.now(), snapshot.featuredSet) } : null;
  }

  private async build(): Promise<StoredSnapshot> {
    const now = this.clock.now();
    const [rows, featuredIds] = await Promise.all([this.repository.loadListings(), this.repository.loadFeaturedIds()]);
    const featured = new Set(featuredIds);
    const listings = rows.map((row) => ({ ...row, base: baseSignalsOf(row, now, featured) }));
    const contentHash = createHash('sha1').update(JSON.stringify([listings, featuredIds])).digest('base64url');
    return { asOf: now.toISOString(), contentHash, listings, featuredIds };
  }
}

function materialize(s: StoredSnapshot): CatalogSnapshot {
  return {
    version: s.contentHash, contentHash: s.contentHash, asOf: new Date(s.asOf), listings: s.listings, featuredIds: s.featuredIds,
    byId: new Map(s.listings.map((l) => [l.id, l])), featuredSet: new Set(s.featuredIds),
  };
}
