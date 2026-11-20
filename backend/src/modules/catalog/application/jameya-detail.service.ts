import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/clock/clock';
import { Errors } from '../../../shared/errors/app-error';
import { Eligibility } from '../../users/domain/user.types';
import { UsersFacade } from '../../users/users.facade';
import { JameyaListing, JameyaSummary, SeatRecord } from '../domain/jameya';
import { blockingReasonOf, RestrictionReason, SeatView, toSeatView } from '../domain/seat-view';
import { JameyasRepository } from '../infrastructure/jameyas.repository';
import { SeatsRepository } from '../infrastructure/seats.repository';
import { CatalogSnapshotService } from './catalog-snapshot.service';
import { MarketplaceService } from './marketplace.service';
import { RankingContextFactory } from './ranking-context.factory';

export type JameyaDetail = JameyaSummary & {
  seats: SeatView[];
  viewer: { canReserve: boolean; blockingReason: RestrictionReason | null; activeReservationId: string | null };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Jameya detail with a viewer-specific seat map, read authoritatively from PostgreSQL. */
@Injectable()
export class JameyaDetailService {
  constructor(
    private readonly jameyas: JameyasRepository,
    private readonly seats: SeatsRepository,
    private readonly users: UsersFacade,
    private readonly snapshots: CatalogSnapshotService,
    private readonly rankingFactory: RankingContextFactory,
    private readonly marketplace: MarketplaceService,
    private readonly clock: Clock,
  ) {}

  async detail(viewerId: string, id: string): Promise<JameyaDetail> {
    if (!UUID.test(id)) throw Errors.notFound('Jameya');
    const [listing, seats, eligibility] = await Promise.all([
      this.jameyas.loadListing(id), this.seats.listSeats(id), this.users.getEligibility(viewerId),
    ]);
    if (!listing) throw Errors.notFound('Jameya');
    const { featuredIds } = await this.snapshots.get();
    const viewer = await this.rankingFactory.forViewer(viewerId, featuredIds, this.clock.now());
    const summary = this.marketplace.present(listing, viewer);
    return { ...summary, ...this.seatMap(listing, seats, eligibility, viewerId) };
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
