import { Injectable } from '@nestjs/common';
import { TwoTierCache } from '../../../shared/cache/two-tier-cache';
import { JameyasRepository, SeatMap } from '../infrastructure/jameyas.repository';

const keyOf = (jameyaId: string) => `mkt:seatmap:${jameyaId}`;

/**
 * Short-lived (2 s, Redis only) seat map for the detail page. Invalidated on every committed seat
 * change of that Jameya. Explicitly NOT used by the booking path, which always reads PostgreSQL.
 */
@Injectable()
export class SeatMapCache {
  constructor(
    private readonly cache: TwoTierCache,
    private readonly repository: JameyasRepository,
  ) {}

  get(jameyaId: string): Promise<SeatMap | null> {
    return this.cache.get({ key: keyOf(jameyaId), l1Ms: 0, l2Ms: 2000, lockMs: 500 }, () => this.repository.loadSeatMap(jameyaId));
  }

  async invalidate(jameyaIds: string[]): Promise<void> {
    await Promise.all([...new Set(jameyaIds)].map((id) => this.cache.invalidate(keyOf(id))));
  }
}
