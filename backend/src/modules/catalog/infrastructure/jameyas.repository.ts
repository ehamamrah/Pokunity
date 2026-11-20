import { Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { JameyaListing } from '../domain/jameya';

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

// One aggregate pass over ~75k seats for 5k Jameyas (tens of ms); refreshed at most every few seconds.
const LISTINGS_SQL = `
  SELECT j.id, j.name, j.monthly_amount, j.duration_months, j.start_date, j.created_at,
         count(s.*)::int AS total_seats,
         count(*) FILTER (WHERE s.status = 'AVAILABLE')::int AS seats_available,
         COALESCE(min(s.fee), 0) AS min_fee, COALESCE(max(s.fee), 0) AS max_fee
  FROM jameyas j JOIN seats s ON s.jameya_id = j.id
  WHERE ($1::uuid IS NULL OR j.id = $1)
  GROUP BY j.id`;

const ACTIVE_FEATURED_SQL = `
  SELECT jameya_id, min(priority) AS priority FROM featured_campaigns
  WHERE now() >= starts_at AND now() < ends_at
  GROUP BY jameya_id ORDER BY priority, jameya_id`;

export interface BookingJameya {
  id: string;
  name: string;
  monthlyAmount: number;
  totalSeats: number;
}

@Injectable()
export class JameyasRepository {
  constructor(private readonly db: Database) {}

  async loadListings(): Promise<JameyaListing[]> {
    const { rows } = await this.db.query<ListingRow>(LISTINGS_SQL, [null]);
    return rows.map(toListing);
  }

  async loadListing(id: string): Promise<JameyaListing | null> {
    const { rows } = await this.db.query<ListingRow>(LISTINGS_SQL, [id]);
    return rows[0] ? toListing(rows[0]) : null;
  }

  /** Active campaigns, best priority first (marketing configuration). */
  async loadFeaturedIds(): Promise<string[]> {
    const { rows } = await this.db.query<{ jameya_id: string }>(ACTIVE_FEATURED_SQL);
    return rows.map((r) => r.jameya_id);
  }

  async findForBooking(id: string): Promise<BookingJameya | null> {
    const { rows } = await this.db.query<{ id: string; name: string; monthly_amount: number; duration_months: number }>(
      'SELECT id, name, monthly_amount, duration_months FROM jameyas WHERE id = $1',
      [id],
    );
    const r = rows[0];
    return r ? { id: r.id, name: r.name, monthlyAmount: r.monthly_amount, totalSeats: r.duration_months } : null;
  }
}

function toListing(r: ListingRow): JameyaListing {
  return {
    id: r.id, name: r.name, monthlyAmount: r.monthly_amount, durationMonths: r.duration_months,
    totalSeats: r.total_seats, seatsAvailable: r.seats_available, minFee: r.min_fee, maxFee: r.max_fee,
    startDate: r.start_date, createdAt: r.created_at,
  };
}
