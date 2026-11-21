import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock';
import { Errors } from '../../../shared/errors/app-error';
import { Conditional, conditionalFromBody } from '../../../shared/http/conditional';
import { ExperimentAssignment } from '../../analytics/domain/experiments';
import { UsersFacade, ViewerProfile } from '../../users/users.facade';
import { JameyaListing, JameyaSummary } from '../domain/jameya';
import { baseSignalsOf } from '../domain/ranking/signals';
import { BlockingReason, blockingReasonOf, SeatView, toSeatView, viewerBlockingReason } from '../domain/seat-view';
import { SeatMap } from '../infrastructure/jameyas.repository';
import { SeatsRepository } from '../infrastructure/seats.repository';
import { CatalogSnapshotService } from './catalog-snapshot.service';
import { MarketplaceService } from './marketplace.service';
import { RankingContextFactory } from './ranking-context.factory';
import { SeatMapCache } from './seat-map.cache';

export type JameyaDetail = JameyaSummary & {
  seats: SeatView[];
  viewer: { canReserve: boolean; blockingReason: BlockingReason | null; activeReservationId: string | null };
  experiment: ExperimentAssignment;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Jameya detail with a viewer-specific seat map: seat map (one query, ≤ 2 s cache invalidated on seat
 * changes) + viewer (one query) + the viewer's active holds (one indexed count). The ETag is the body
 * without `asOf`, so it changes exactly when something the viewer sees changes.
 */
@Injectable()
export class JameyaDetailService {
  constructor(
    private readonly seatMaps: SeatMapCache,
    private readonly seats: SeatsRepository,
    private readonly users: UsersFacade,
    private readonly snapshots: CatalogSnapshotService,
    private readonly rankingFactory: RankingContextFactory,
    private readonly marketplace: MarketplaceService,
    private readonly clock: Clock,
  ) {}

  async detail(viewerId: string, id: string): Promise<Conditional> {
    if (!UUID.test(id)) throw Errors.notFound('Jameya');
    const [map, viewer, snapshot, activeHolds] = await Promise.all([
      this.seatMaps.get(id), this.users.getViewer(viewerId), this.snapshots.get(), this.seats.countHeldBy(viewerId),
    ]);
    if (!map) throw Errors.notFound('Jameya');
    const listing: JameyaListing = { ...map.jameya, base: baseSignalsOf(map.jameya, this.clock.now(), snapshot.featuredSet) };
    const ranking = this.rankingFactory.build(viewerId, viewer.personalization, snapshot.featuredSet, new Date(map.loadedAt));
    const body: JameyaDetail = {
      ...this.marketplace.present(listing, ranking), ...this.seatMap(listing, map, viewer, { viewerId, activeHolds }),
      experiment: ranking.experiment,
    };
    return conditionalFromBody(body, new Date(map.loadedAt), ['asOf']);
  }

  private seatMap(listing: JameyaListing, map: SeatMap, viewer: ViewerProfile, who: { viewerId: string; activeHolds: number }) {
    const { kyc, riskTier, maxActiveHolds } = viewer.eligibility;
    const views = map.seats.map((seat) => toSeatView(seat, {
      startDate: listing.startDate, viewerId: who.viewerId, blocking: blockingReasonOf(kyc.status),
      riskRestricted: this.users.isSeatRestricted(riskTier, seat.seatNumber, listing.totalSeats),
    }));
    const own = map.seats.find((s) => s.status === 'HELD' && s.holderUserId === who.viewerId);
    const activeReservationId = own?.reservationId ?? null;
    const holds = { active: who.activeHolds, max: maxActiveHolds, heldHere: !!activeReservationId };
    const blockingReason = viewerBlockingReason(kyc.status, holds);
    const canReserve = !blockingReason && !activeReservationId && views.some((v) => v.status === 'AVAILABLE' && !v.restricted);
    return { seats: views, viewer: { canReserve, blockingReason, activeReservationId } };
  }
}
