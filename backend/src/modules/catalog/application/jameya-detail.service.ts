import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock';
import { Errors } from '../../../shared/errors/app-error';
import { Eligibility } from '../../users/domain/user.types';
import { UsersFacade } from '../../users/users.facade';
import { JameyaListing, JameyaSummary, SeatRecord } from '../domain/jameya';
import { baseSignalsOf } from '../domain/ranking/signals';
import { blockingReasonOf, RestrictionReason, SeatView, toSeatView } from '../domain/seat-view';
import { CatalogSnapshotService } from './catalog-snapshot.service';
import { MarketplaceService } from './marketplace.service';
import { RankingContextFactory } from './ranking-context.factory';
import { SeatMapCache } from './seat-map.cache';

export type JameyaDetail = JameyaSummary & {
  seats: SeatView[];
  viewer: { canReserve: boolean; blockingReason: RestrictionReason | null; activeReservationId: string | null };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Jameya detail with a viewer-specific seat map. The seat map comes from one query (≤ 2 s cache,
 * invalidated on seat changes); the viewer (profile + KYC + preferences) from one more.
 */
@Injectable()
export class JameyaDetailService {
  constructor(
    private readonly seatMaps: SeatMapCache,
    private readonly users: UsersFacade,
    private readonly snapshots: CatalogSnapshotService,
    private readonly rankingFactory: RankingContextFactory,
    private readonly marketplace: MarketplaceService,
    private readonly clock: Clock,
  ) {}

  async detail(viewerId: string, id: string): Promise<JameyaDetail> {
    if (!UUID.test(id)) throw Errors.notFound('Jameya');
    const [map, viewer, snapshot] = await Promise.all([this.seatMaps.get(id), this.users.getViewer(viewerId), this.snapshots.get()]);
    if (!map) throw Errors.notFound('Jameya');
    const now = this.clock.now();
    const listing: JameyaListing = { ...map.jameya, base: baseSignalsOf(map.jameya, now, snapshot.featuredSet) };
    const ranking = this.rankingFactory.build(viewerId, viewer.personalization, snapshot.featuredSet, now);
    const summary = this.marketplace.present(listing, ranking);
    return { ...summary, ...this.seatMap(listing, map.seats, viewer.eligibility, viewerId) };
  }

  private seatMap(listing: JameyaListing, seats: SeatRecord[], eligibility: Eligibility, viewerId: string) {
    const blocking = blockingReasonOf(eligibility.kyc.status);
    const views = seats.map((seat) => toSeatView(seat, {
      startDate: listing.startDate, viewerId, blocking,
      riskRestricted: this.users.isSeatRestricted(eligibility.riskTier, seat.seatNumber, listing.totalSeats),
    }));
    const own = seats.find((s) => s.status === 'HELD' && s.holderUserId === viewerId);
    const activeReservationId = own?.reservationId ?? null;
    const canReserve = !blocking && !activeReservationId && views.some((v) => v.status === 'AVAILABLE' && !v.restricted);
    return { seats: views, viewer: { canReserve, blockingReason: blocking, activeReservationId } };
  }
}
