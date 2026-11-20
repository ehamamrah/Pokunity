import { expect, it } from 'vitest';
import { checkoutReducer, IDLE_CHECKOUT, type CheckoutEvent, type CheckoutState } from './checkout-machine';

const ID = 'r-1';

function run(events: CheckoutEvent[], start: CheckoutState = IDLE_CHECKOUT): CheckoutState {
  return events.reduce(checkoutReducer, start);
}

const held: CheckoutState = { phase: 'held', reservationId: ID };
const paying: CheckoutState = { phase: 'paying', reservationId: ID };

it('walks idle -> holding -> held -> paying -> confirmed on the happy path', () => {
  const state = run([
    { type: 'RESERVE_REQUESTED', seatNumber: 7 },
    { type: 'HOLD_CREATED', reservationId: ID },
    { type: 'PAY_REQUESTED' },
    { type: 'PAY_ACCEPTED' },
    { type: 'SERVER_STATUS', reservationId: ID, status: 'CONFIRMED', failureReason: null },
  ]);
  expect(state).toEqual({ phase: 'confirmed', reservationId: ID });
});

it('never reaches confirmed from an accepted (202) response alone', () => {
  const state = run([{ type: 'HOLD_CREATED', reservationId: ID }, { type: 'PAY_REQUESTED' }, { type: 'PAY_ACCEPTED' }], held);
  expect(state.phase).toBe('paying');
});

it('confirms immediately only on the zero-fee 200 response', () => {
  const state = run([{ type: 'PAY_REQUESTED' }, { type: 'PAY_CONFIRMED_IMMEDIATELY' }], held);
  expect(state.phase).toBe('confirmed');
});

it('maps FAILED with its reason from the server', () => {
  const failed = run([{ type: 'SERVER_STATUS', reservationId: ID, status: 'FAILED', failureReason: 'PAYMENT_DECLINED' }], paying);
  expect(failed).toEqual({ phase: 'failed', reservationId: ID, failureReason: 'PAYMENT_DECLINED' });
});

it('maps a RESERVATION_EXPIRED rejection to expired', () => {
  const expired = run([{ type: 'PAY_REJECTED', code: 'RESERVATION_EXPIRED' }], held);
  expect(expired.phase).toBe('expired');
});

it('returns to held on a non-expiry rejection so the user can retry', () => {
  const state = run([{ type: 'PAY_REJECTED', code: 'IDEMPOTENCY_IN_PROGRESS' }], paying);
  expect(state.phase).toBe('held');
});

it('keeps terminal phases sticky and ignores out-of-order events', () => {
  const confirmed: CheckoutState = { phase: 'confirmed', reservationId: ID };
  expect(run([{ type: 'PAY_REQUESTED' }, { type: 'RELEASED' }], confirmed)).toBe(confirmed);
});

it('returns the same object when the server status is unchanged (no re-render churn)', () => {
  const event: CheckoutEvent = { type: 'SERVER_STATUS', reservationId: ID, status: 'HELD', failureReason: null };
  expect(checkoutReducer(held, event)).toBe(held);
});

it('returns to idle when holding fails', () => {
  expect(run([{ type: 'RESERVE_REQUESTED', seatNumber: 3 }, { type: 'HOLD_FAILED' }])).toEqual(IDLE_CHECKOUT);
});
