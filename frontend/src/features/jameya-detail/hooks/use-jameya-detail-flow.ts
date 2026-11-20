'use client';

import { useReducer, useState, type Dispatch } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { analytics } from '@/features/analytics';
import { checkoutReducer, type CheckoutEvent, type CheckoutState } from '@/features/checkout';
import { describeReservationError, type ErrorPresentation } from '@/features/reservations';
import { DEFAULT_FILTERS, toSearchParams } from '@/features/marketplace';
import { ROUTES } from '@/shared/config/routes';
import { queryKeys } from '@/shared/query';
import { idempotencyKeys } from '@/shared/lib/idempotency';
import type { JameyaDetail } from '@/shared/contract';
import { useJameyaDetail } from '../api/use-jameya-detail';
import { useReserveSeat } from '../api/use-reserve-seat';
import { nearestAvailableSeats } from '../model/nearest-seats';
import { reserveScope } from '../model/optimistic';

const IDLE: CheckoutState = { phase: 'idle' };
type ReserveMutation = ReturnType<typeof useReserveSeat>;

export interface DetailFlow {
  detail: JameyaDetail | undefined;
  loading: boolean;
  loadError: unknown;
  selectedSeat: number | null;
  holdingSeat: number | null;
  reserving: boolean;
  error: ErrorPresentation | null;
  selectSeat: (seatNumber: number) => void;
  reserveSelected: () => void;
  refresh: () => void;
}

function similarJameyasHref(detail: JameyaDetail): string {
  const params = toSearchParams({ ...DEFAULT_FILTERS, minMonthly: detail.monthlyAmount, maxMonthly: detail.monthlyAmount });
  return `${ROUTES.home}?${params.toString()}`;
}

function useSeatSelection(jameyaId: string) {
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const selectSeat = (seatNumber: number) => {
    setSelectedSeat(seatNumber);
    analytics.track({ type: 'seat_selected', jameyaId, surface: 'jameya_detail', position: null });
  };
  return { selectedSeat, selectSeat };
}

/** The reserve step is driven by the checkout machine: idle -> holding -> held (or back to idle). */
function useReserveMachine(jameyaId: string): { phase: CheckoutState; dispatch: Dispatch<CheckoutEvent>; reserve: ReserveMutation } {
  const router = useRouter();
  const [phase, dispatch] = useReducer(checkoutReducer, IDLE);
  const reserve = useReserveSeat(jameyaId, {
    onReserved: (reservation) => {
      dispatch({ type: 'HOLD_CREATED', reservationId: reservation.id });
      router.push(ROUTES.reservation(reservation.id));
    },
    onFailed: () => dispatch({ type: 'HOLD_FAILED' }),
  });
  return { phase, dispatch, reserve };
}

function presentError(reserve: ReserveMutation, detail: JameyaDetail | undefined, selectedSeat: number | null): ErrorPresentation | null {
  if (!reserve.isError || !detail) return null;
  return describeReservationError(reserve.error, {
    suggestedSeats: nearestAvailableSeats(detail.seats, reserve.variables?.seatNumber ?? selectedSeat ?? 0),
    similarHref: similarJameyasHref(detail),
  });
}

/** Re-reads the seat map from the server (used by "Refresh and choose again"). */
function useRefreshDetail(jameyaId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.jameyas.detail(jameyaId) });
  };
}

function holdingOf(phase: CheckoutState): number | null {
  return phase.phase === 'holding' ? phase.seatNumber : null;
}

function reserveActionFor(jameyaId: string, selectedSeat: number | null, machine: ReturnType<typeof useReserveMachine>): () => void {
  return () => {
    if (selectedSeat === null) return;
    const idempotencyKey = idempotencyKeys.keyFor(reserveScope(jameyaId, selectedSeat));
    machine.dispatch({ type: 'RESERVE_REQUESTED', seatNumber: selectedSeat });
    machine.reserve.mutate({ seatNumber: selectedSeat, idempotencyKey });
  };
}

function loadStateOf(query: ReturnType<typeof useJameyaDetail>) {
  return { detail: query.data, loading: query.isPending, loadError: query.error };
}

/** Hook: selection, the reserve mutation, error copy and seat analytics for the detail page. */
export function useJameyaDetailFlow(jameyaId: string): DetailFlow {
  const query = useJameyaDetail(jameyaId);
  const selection = useSeatSelection(jameyaId);
  const machine = useReserveMachine(jameyaId);
  return {
    ...loadStateOf(query),
    ...selection,
    holdingSeat: holdingOf(machine.phase),
    reserving: holdingOf(machine.phase) !== null,
    error: presentError(machine.reserve, query.data, selection.selectedSeat),
    reserveSelected: reserveActionFor(jameyaId, selection.selectedSeat, machine),
    refresh: useRefreshDetail(jameyaId),
  };
}
