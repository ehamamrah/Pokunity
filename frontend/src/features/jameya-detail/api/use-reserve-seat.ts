'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createReservation } from '@/features/reservations';
import { isAutoRetryableWrite, shouldRetryWrite, writeRetryDelayMs } from '@/shared/api-client';
import type { JameyaDetail, Reservation } from '@/shared/contract';
import { idempotencyKeys } from '@/shared/lib/idempotency';
import { queryKeys } from '@/shared/query';
import { markSeatHeld, reserveScope } from '../model/optimistic';

export interface ReserveVariables {
  seatNumber: number;
  idempotencyKey: string;
}

export interface ReserveCallbacks {
  onReserved: (reservation: Reservation) => void;
  onFailed: () => void;
}

interface OptimisticContext {
  previous: JameyaDetail | undefined;
}

async function optimisticHold(queryClient: QueryClient, key: readonly unknown[], seatNumber: number): Promise<OptimisticContext> {
  await queryClient.cancelQueries({ queryKey: key });
  const previous = queryClient.getQueryData<JameyaDetail>(key);
  if (previous) queryClient.setQueryData<JameyaDetail>(key, markSeatHeld(previous, seatNumber));
  return { previous };
}

/** Rolls the seat map back to the pre-click snapshot and settles the intent when the outcome is final. */
function failReserve(queryClient: QueryClient, key: readonly unknown[], jameyaId: string, callbacks: ReserveCallbacks, error: unknown, variables: ReserveVariables, context: OptimisticContext | undefined): void {
  if (context?.previous) queryClient.setQueryData(key, context.previous);
  if (!isAutoRetryableWrite(error)) idempotencyKeys.settle(reserveScope(jameyaId, variables.seatNumber));
  callbacks.onFailed();
}

function succeedReserve(jameyaId: string, callbacks: ReserveCallbacks, reservation: Reservation, variables: ReserveVariables): void {
  idempotencyKeys.settle(reserveScope(jameyaId, variables.seatNumber));
  callbacks.onReserved(reservation);
}

async function sendReserve(jameyaId: string, { seatNumber, idempotencyKey }: ReserveVariables): Promise<Reservation> {
  const response = await createReservation({ jameyaId, seatNumber }, idempotencyKey);
  return response.data;
}

/** Reserve with optimistic UI: "Holding…" at once, rolled back on failure, re-read from the server either way. */
export function useReserveSeat(jameyaId: string, callbacks: ReserveCallbacks) {
  const queryClient = useQueryClient();
  const detailKey = queryKeys.jameyas.detail(jameyaId);
  return useMutation({
    mutationFn: (variables: ReserveVariables) => sendReserve(jameyaId, variables),
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelayMs,
    onMutate: ({ seatNumber }) => optimisticHold(queryClient, detailKey, seatNumber),
    onError: (error, variables, context) => failReserve(queryClient, detailKey, jameyaId, callbacks, error, variables, context),
    onSuccess: (reservation, variables) => succeedReserve(jameyaId, callbacks, reservation, variables),
    onSettled: () => queryClient.invalidateQueries({ queryKey: detailKey }),
  });
}
