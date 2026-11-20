import type { FailureReason, ReservationStatus } from '@/shared/contract';
import { findJameyaDef, JAMEYA_DEFS, type JameyaDef } from './fixtures';

/** A mock reservation. `payment` holds the outcome the simulated provider will reach. */
export interface StoredReservation {
  id: string;
  jameyaId: string;
  seatNumber: number;
  fee: number;
  monthlyAmount: number;
  status: ReservationStatus;
  failureReason: FailureReason | null;
  paymentId: string | null;
  paymentStatus: 'AUTHORIZING' | 'AUTHORIZED' | 'CAPTURED' | 'VOIDED' | 'FAILED' | null;
  expiresAt: number;
  createdAt: string;
  updatedAt: string;
  /** Set when checkout starts; the outcome is resolved lazily against the clock. */
  pay?: { token: string; startedAt: number };
}

export interface IdempotencyRecord {
  fingerprint: string;
  status: number;
  body: unknown;
}

export interface RequestLogEntry {
  method: string;
  path: string;
  idempotencyKey: string | null;
  body: unknown;
}

export const HOLD_TTL_MS = 5 * 60_000;

interface MockDb {
  reservations: Map<string, StoredReservation>;
  idempotency: Map<string, IdempotencyRecord>;
  requests: RequestLogEntry[];
  events: unknown[];
  viewerRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  viewerKyc: 'VERIFIED' | 'PENDING' | 'REJECTED' | 'UNKNOWN';
  sequence: number;
}

const freshDb = (): MockDb => ({
  reservations: new Map(),
  idempotency: new Map(),
  requests: [],
  events: [],
  viewerRisk: 'LOW',
  viewerKyc: 'VERIFIED',
  sequence: 0,
});

export const db: MockDb = freshDb();

/** Clears all mock state. Tests call this between cases so they stay independent. */
export function resetMockDb(): void {
  Object.assign(db, freshDb());
}

export function nextId(prefix: string): string {
  db.sequence += 1;
  const suffix = String(db.sequence).padStart(12, '0');
  return `${prefix}-0000-4000-8000-${suffix}`;
}

/** Seat states visible to the viewer, derived from seeds and the reservations store. */
export function seatStatusFor(def: JameyaDef, seatNumber: number): { status: 'AVAILABLE' | 'HELD' | 'TAKEN'; heldByViewer: boolean } {
  const confirmed = [...db.reservations.values()].some(
    (r) => r.jameyaId === def.id && r.seatNumber === seatNumber && r.status === 'CONFIRMED',
  );
  if (confirmed || def.takenSeats.includes(seatNumber)) return { status: 'TAKEN', heldByViewer: false };
  const mine = activeReservationFor(def.id, seatNumber);
  if (mine) return { status: 'HELD', heldByViewer: true };
  if (def.heldSeats.includes(seatNumber)) return { status: 'HELD', heldByViewer: false };
  return { status: 'AVAILABLE', heldByViewer: false };
}

export function activeReservationFor(jameyaId: string, seatNumber: number): StoredReservation | undefined {
  return [...db.reservations.values()].find(
    (r) => r.jameyaId === jameyaId && r.seatNumber === seatNumber && (r.status === 'HELD' || r.status === 'PAYMENT_PENDING'),
  );
}

export function viewerActiveHoldIn(jameyaId: string): StoredReservation | undefined {
  return [...db.reservations.values()].find(
    (r) => r.jameyaId === jameyaId && (r.status === 'HELD' || r.status === 'PAYMENT_PENDING'),
  );
}

export function isKnownJameya(id: string): boolean {
  return findJameyaDef(id) !== undefined;
}

export { JAMEYA_DEFS };
