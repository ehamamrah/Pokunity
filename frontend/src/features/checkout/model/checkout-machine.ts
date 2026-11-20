import type { FailureReason, ReservationStatus } from '@/shared/contract';

/**
 * Checkout lifecycle as a state machine:
 *
 *   idle -> holding -> held -> paying -> confirmed | failed | expired
 *                        \-> cancelled (released by the user)
 *
 * Terminal phases are sticky. `confirmed` is reachable only from the server (a 202 is
 * "paying", never "confirmed"), so success is never shown optimistically.
 */
export type CheckoutState =
  | { phase: 'idle' }
  | { phase: 'holding'; seatNumber: number }
  | { phase: 'held'; reservationId: string }
  | { phase: 'paying'; reservationId: string }
  | { phase: 'confirmed'; reservationId: string }
  | { phase: 'failed'; reservationId: string; failureReason: FailureReason | null }
  | { phase: 'expired'; reservationId: string }
  | { phase: 'cancelled'; reservationId: string };

export type CheckoutPhase = CheckoutState['phase'];

export type CheckoutEvent =
  | { type: 'RESERVE_REQUESTED'; seatNumber: number }
  | { type: 'HOLD_CREATED'; reservationId: string }
  | { type: 'HOLD_FAILED' }
  | { type: 'PAY_REQUESTED' }
  | { type: 'PAY_ACCEPTED' }
  | { type: 'PAY_CONFIRMED_IMMEDIATELY' }
  | { type: 'PAY_REJECTED'; code: string }
  | { type: 'RELEASED' }
  | {
      type: 'SERVER_STATUS';
      reservationId: string;
      status: ReservationStatus;
      failureReason: FailureReason | null;
    };

export const IDLE_CHECKOUT: CheckoutState = { phase: 'idle' };

type StateFactory = (reservationId: string, failureReason: FailureReason | null) => CheckoutState;

/** Lookup table from the authoritative server status to a machine phase. */
const FROM_STATUS: Record<ReservationStatus, StateFactory> = {
  HELD: (reservationId) => ({ phase: 'held', reservationId }),
  PAYMENT_PENDING: (reservationId) => ({ phase: 'paying', reservationId }),
  CONFIRMED: (reservationId) => ({ phase: 'confirmed', reservationId }),
  FAILED: (reservationId, failureReason) => ({ phase: 'failed', reservationId, failureReason }),
  EXPIRED: (reservationId) => ({ phase: 'expired', reservationId }),
  CANCELLED: (reservationId) => ({ phase: 'cancelled', reservationId }),
};

/** Maps the authoritative server status onto a machine phase. */
export function stateFromServer(
  reservationId: string,
  status: ReservationStatus,
  failureReason: FailureReason | null,
): CheckoutState {
  return FROM_STATUS[status](reservationId, failureReason);
}

export function isHoldActive(state: CheckoutState): boolean {
  return state.phase === 'held' || state.phase === 'paying';
}

export function isTerminalPhase(state: CheckoutState): boolean {
  return ['confirmed', 'failed', 'expired', 'cancelled'].includes(state.phase);
}

function sameState(a: CheckoutState, b: CheckoutState): boolean {
  if (a.phase !== b.phase) return false;
  if ('reservationId' in a && 'reservationId' in b && a.reservationId !== b.reservationId) return false;
  if (a.phase === 'failed' && b.phase === 'failed') return a.failureReason === b.failureReason;
  return true;
}

function fromServerEvent(state: CheckoutState, event: Extract<CheckoutEvent, { type: 'SERVER_STATUS' }>): CheckoutState {
  const next = stateFromServer(event.reservationId, event.status, event.failureReason);
  return sameState(state, next) ? state : next;
}

function onPaying(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  if (state.phase !== 'paying' && state.phase !== 'held') return state;
  switch (event.type) {
    case 'PAY_CONFIRMED_IMMEDIATELY':
      return { phase: 'confirmed', reservationId: state.reservationId };
    case 'PAY_REJECTED':
      return event.code === 'RESERVATION_EXPIRED' ? { phase: 'expired', reservationId: state.reservationId } : { phase: 'held', reservationId: state.reservationId };
    default:
      return state;
  }
}

function onHolding(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  if (state.phase === 'idle' && event.type === 'RESERVE_REQUESTED') return { phase: 'holding', seatNumber: event.seatNumber };
  if (state.phase !== 'holding') return state;
  if (event.type === 'HOLD_CREATED') return { phase: 'held', reservationId: event.reservationId };
  if (event.type === 'HOLD_FAILED') return IDLE_CHECKOUT;
  return state;
}

/** Pure transition function. Unknown or out-of-order events leave the state unchanged. */
export function checkoutReducer(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  if (isTerminalPhase(state)) return state;
  if (event.type === 'SERVER_STATUS') return fromServerEvent(state, event);
  if (state.phase === 'idle' || state.phase === 'holding') return onHolding(state, event);
  if (state.phase === 'held' && event.type === 'PAY_REQUESTED') return { phase: 'paying', reservationId: state.reservationId };
  if (state.phase === 'held' && event.type === 'RELEASED') return { phase: 'cancelled', reservationId: state.reservationId };
  return onPaying(state, event);
}
