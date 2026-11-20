export const CLIENT_EVENT_TYPES = ['impression', 'click', 'seat_selected', 'checkout_started'] as const;
export const SERVER_EVENT_TYPES = ['reservation_created', 'reservation_confirmed'] as const;
// 'checkout' is a lenient superset of the contract enum (docs/api/change-requests.md GAP-FE-001).
export const SURFACES = ['marketplace_list', 'featured_carousel', 'jameya_detail', 'checkout'] as const;

export type ServerEventType = (typeof SERVER_EVENT_TYPES)[number];

export interface AnalyticsEventRecord {
  userId: string;
  source: 'client' | 'server';
  type: string;
  jameyaId: string | null;
  position: number | null;
  surface: string | null;
  experimentKey: string | null;
  variant: string | null;
  occurredAt: Date;
}
