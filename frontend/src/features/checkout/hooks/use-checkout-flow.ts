'use client';

import { useEffect, useReducer, useState, type Dispatch } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { analytics } from '@/features/analytics';
import { describeReservationError, type ErrorPresentation } from '@/features/reservations';
import { useReleaseReservation } from '@/features/reservations';
import type { ApiResponse } from '@/shared/api-client';
import { ROUTES } from '@/shared/config/routes';
import type { Reservation } from '@/shared/contract';
import { idempotencyKeys } from '@/shared/lib/idempotency';
import { queryKeys } from '@/shared/query';
import { checkoutReducer, stateFromServer, type CheckoutEvent, type CheckoutState } from '../model/checkout-machine';
import { DEFAULT_PAYMENT_TOKEN, type PaymentTestToken } from '../model/payment-methods';
import { checkoutScope, useStartCheckout, type CheckoutVariables } from '../api/use-start-checkout';

type Token = PaymentTestToken['token'];

export interface CheckoutFlow {
  state: CheckoutState;
  token: Token;
  setToken: (token: Token) => void;
  holdEnded: boolean;
  markHoldEnded: () => void;
  rejection: ErrorPresentation | null;
  paying: boolean;
  releasing: boolean;
  payNow: () => void;
  releaseNow: () => void;
  refresh: () => void;
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : '';
}

/** Replays every server status (including each poll) into the machine: the server stays the authority. */
function useServerStatusSync(reservation: Reservation, dispatch: Dispatch<CheckoutEvent>): void {
  useEffect(() => {
    dispatch({ type: 'SERVER_STATUS', reservationId: reservation.id, status: reservation.status, failureReason: reservation.failureReason });
  }, [dispatch, reservation.id, reservation.status, reservation.failureReason]);
}

/** Local UI intent: the chosen token and whether the hold ran out while the page was open. */
function usePaymentIntent() {
  const [token, setToken] = useState<Token>(DEFAULT_PAYMENT_TOKEN);
  const [holdEnded, setHoldEnded] = useState(false);
  return { token, setToken, holdEnded, markHoldEnded: () => setHoldEnded(true) };
}

function usePaymentActions(reservation: Reservation, dispatch: Dispatch<CheckoutEvent>, setRejection: (r: ErrorPresentation | null) => void) {
  return useStartCheckout(reservation.id, {
    onAccepted: (response: ApiResponse<Reservation>) => {
      setRejection(null);
      dispatch(response.status === 200 ? { type: 'PAY_CONFIRMED_IMMEDIATELY' } : { type: 'PAY_ACCEPTED' });
    },
    onRejected: (error: unknown) => {
      dispatch({ type: 'PAY_REJECTED', code: errorCode(error) });
      setRejection(describeReservationError(error, { jameyaHref: ROUTES.jameya(reservation.jameyaId) }));
    },
  });
}

type PayMutation = ReturnType<typeof usePaymentActions>;

function payActionFor(reservation: Reservation, token: Token, dispatch: Dispatch<CheckoutEvent>, pay: PayMutation): () => void {
  return () => {
    analytics.track({ type: 'checkout_started', jameyaId: reservation.jameyaId, surface: 'checkout', position: null });
    dispatch({ type: 'PAY_REQUESTED' });
    const variables: CheckoutVariables = { token, idempotencyKey: idempotencyKeys.keyFor(checkoutScope(reservation.id, token)) };
    pay.mutate(variables);
  };
}

/** Release is not a payment, so its outcome comes from the server response. The status is synced too. */
function useSyncedRelease(reservation: Reservation, dispatch: Dispatch<CheckoutEvent>) {
  useServerStatusSync(reservation, dispatch);
  return useReleaseReservation(reservation.id);
}

function releaseActionFor(release: ReturnType<typeof useReleaseReservation>, dispatch: Dispatch<CheckoutEvent>): () => void {
  return () => release.mutate(undefined, { onSuccess: () => dispatch({ type: 'RELEASED' }) });
}

/**
 * Hook: drives the checkout machine for one reservation. Local intent goes through the machine;
 * outcomes come from the server responses and polls.
 */
export function useCheckoutFlow(reservation: Reservation): CheckoutFlow {
  const [state, dispatch] = useReducer(checkoutReducer, reservation, (r) => stateFromServer(r.id, r.status, r.failureReason));
  const [rejection, setRejection] = useState<ErrorPresentation | null>(null);
  const intent = usePaymentIntent();
  const release = useSyncedRelease(reservation, dispatch);
  const pay = usePaymentActions(reservation, dispatch, setRejection);
  const queryClient = useQueryClient();
  const flags = { paying: pay.isPending || state.phase === 'paying', releasing: release.isPending };
  return { state, rejection, ...flags, ...intent, payNow: payActionFor(reservation, intent.token, dispatch, pay), releaseNow: releaseActionFor(release, dispatch), refresh: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.reservations.detail(reservation.id) }); } };
}
