import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { JameyaRow, SeatRecord } from '../domain/jameya';

interface ListingRow {
  id: string;
  name: string;
  monthly_amount: number;
  duration_months: number;
  start_date: string;
  created_at: Date;
  total_seats: number;
  seats_available: number;
  min_fee: number;
  max_fee: number;
}

// Fee range and seat totals are denormalised on jameyas (migration 0002); availability comes from an
// index-only scan of the partial index seats_available_idx. No per-request aggregation of all seats.
const LISTINGS_SQL = `
  SELECT j.id, j.name, j.monthly_amount, j.duration_months, j.start_date, j.created_at, j.total_seats,
         j.min_fee, j.max_fee, COALESCE(a.available, 0) AS seats_available
  FROM jameyas j
  LEFT JOIN (SELECT jameya_id, count(*)::int AS available FROM seats WHERE status = 'AVAILABLE' GROUP BY jameya_id) a
    ON a.jameya_id = j.id
  WHERE j.total_seats > 0`;

const ACTIVE_FEATURED_SQL = `
  SELECT jameya_id, min(priority) AS priority FROM featured_campaigns
  WHERE now() >= starts_at AND now() < ends_at
  GROUP BY jameya_id ORDER BY priority, jameya_id`;

// Detail page: the Jameya and its whole seat map in ONE round trip.
const SEAT_MAP_SQL = `
  SELECT j.id, j.name, j.monthly_amount, j.duration_months, j.start_date, j.created_at, j.total_seats,
         j.min_fee, j.max_fee, 0 AS seats_available,
         (SELECT json_agg(json_build_object('seatNumber', s.seat_number, 'fee', s.fee, 'status', s.status,
                 'reservationId', s.reservation_id, 'holderUserId', s.holder_user_id) ORDER BY s.seat_number)
          FROM seats s WHERE s.jameya_id = j.id) AS seats
  FROM jameyas j WHERE j.id = $1`;

export interface BookingJameya {
  id: string;
  name: string;
  monthlyAmount: number;
  totalSeats: number;
}

export interface SeatMap {
  jameya: JameyaRow;
  seats: SeatRecord[];
  /** When this seat map was read from PostgreSQL (becomes X-As-Of). */
  loadedAt: string;
}

@Injectable()
export class JameyasRepository {
  constructor(private readonly db: Database) {}

  async loadListings(): Promise<JameyaRow[]> {
    const { rows } = await this.db.query<ListingRow>(LISTINGS_SQL);
    return rows.map(toRow);
  }

  /** Active campaigns, best priority first (marketing configuration). */
  async loadFeaturedIds(): Promise<string[]> {
    const { rows } = await this.db.query<{ jameya_id: string }>(ACTIVE_FEATURED_SQL);
    return rows.map((r) => r.jameya_id);
  }

  async loadSeatMap(id: string): Promise<SeatMap | null> {
    const { rows } = await this.db.query<ListingRow & { seats: SeatRecord[] | null }>(SEAT_MAP_SQL, [id]);
    if (!rows[0]) return null;
    const seats = rows[0].seats ?? [];
    const jameya = { ...toRow(rows[0]), seatsAvailable: seats.filter((s) => s.status === 'AVAILABLE').length };
    return { jameya, seats, loadedAt: new Date().toISOString() };
  }

  async findForBooking(id: string): Promise<BookingJameya | null> {
    const { rows } = await this.db.query<{ id: string; name: string; monthly_amount: number; total_seats: number }>(
      'SELECT id, name, monthly_amount, total_seats FROM jameyas WHERE id = $1',
      [id],
    );
    const r = rows[0];
    return r ? { id: r.id, name: r.name, monthlyAmount: r.monthly_amount, totalSeats: r.total_seats } : null;
  }
}

function toRow(r: ListingRow): JameyaRow {
  return {
    id: r.id, name: r.name, monthlyAmount: r.monthly_amount, durationMonths: r.duration_months,
    totalSeats: r.total_seats, seatsAvailable: r.seats_available, minFee: r.min_fee, maxFee: r.max_fee,
    startDate: r.start_date, createdAt: new Date(r.created_at).toISOString(),
  };
}
