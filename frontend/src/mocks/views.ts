import { badgesFor, feeForSeat, JAMEYA_DEFS, payoutMonthForSeat, type JameyaDef } from './fixtures';
import { db, seatStatusFor, viewerActiveHoldIn, type StoredReservation } from './db';
import { settle } from './lifecycle';

function rankingFor(def: JameyaDef) {
  return {
    score: Number((0.95 - def.monthlyAmount / 1_000_000).toFixed(2)),
    reasons: def.monthlyAmount === 100000 ? ['Matches your usual monthly amount'] : ['Starts soon'],
  };
}

function terms(def: JameyaDef) {
  return {
    id: def.id,
    name: def.name,
    monthlyAmount: def.monthlyAmount,
    currency: 'SAR' as const,
    durationMonths: def.durationMonths,
    totalSeats: def.durationMonths,
    payoutAmount: def.monthlyAmount * def.durationMonths,
    minFee: 0,
    maxFee: def.maxFee,
    startDate: def.startDate,
    featured: def.featured,
  };
}

function availabilityFor(def: JameyaDef) {
  const seats = Array.from({ length: def.durationMonths }, (_, index) => seatStatusFor(def, index + 1));
  const seatsAvailable = seats.filter((seat) => seat.status === 'AVAILABLE').length;
  return { seatsAvailable, badges: badgesFor(def, seatsAvailable) };
}

export function summaryFor(def: JameyaDef, nowMs: number) {
  return { ...terms(def), ...availabilityFor(def), ranking: rankingFor(def), asOf: new Date(nowMs).toISOString() };
}

function seatView(def: JameyaDef, seatNumber: number) {
  const seat = seatStatusFor(def, seatNumber);
  const restricted = db.viewerRisk === 'HIGH' && seatNumber <= 3;
  return {
    seatNumber,
    payoutMonth: payoutMonthForSeat(def, seatNumber),
    fee: feeForSeat(def, seatNumber),
    status: seat.status,
    heldByViewer: seat.heldByViewer,
    restricted,
    restrictionReason: restricted ? ('RISK_TIER' as const) : null,
  };
}

function viewerFor(def: JameyaDef) {
  const active = viewerActiveHoldIn(def.id);
  const kycOk = db.viewerKyc === 'VERIFIED';
  return {
    canReserve: kycOk && !active,
    blockingReason: kycOk ? null : ('KYC_REQUIRED' as const),
    activeReservationId: active?.id ?? null,
  };
}

export function detailFor(def: JameyaDef, nowMs: number) {
  const seats = Array.from({ length: def.durationMonths }, (_, index) => seatView(def, index + 1));
  return { ...summaryFor(def, nowMs), seats, viewer: viewerFor(def) };
}

function paymentView(current: StoredReservation) {
  if (!current.paymentId || !current.paymentStatus) return null;
  return { id: current.paymentId, status: current.paymentStatus, amount: current.fee, currency: 'SAR' as const };
}

function reservationTerms(current: StoredReservation) {
  return {
    id: current.id,
    jameyaId: current.jameyaId,
    seatNumber: current.seatNumber,
    fee: current.fee,
    monthlyAmount: current.monthlyAmount,
    currency: 'SAR' as const,
    status: current.status,
    expiresAt: new Date(current.expiresAt).toISOString(),
    failureReason: current.failureReason,
  };
}

export function reservationView(stored: StoredReservation, nowMs: number) {
  const current = settle(stored, nowMs);
  const name = JAMEYA_DEFS.find((candidate) => candidate.id === current.jameyaId)?.name ?? 'Jameya';
  return { ...reservationTerms(current), jameyaName: name, payment: paymentView(current), createdAt: current.createdAt, updatedAt: current.updatedAt };
}
