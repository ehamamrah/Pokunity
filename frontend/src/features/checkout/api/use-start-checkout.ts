'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { checkoutReservation } from '@/features/reservations';
import { isAutoRetryableWrite, shouldRetryWrite, writeRetryDelayMs, type ApiResponse } from '@/shared/api-client';
import type { Reservation } from '@/shared/contract';
import { idempotencyKeys } from '@/shared/lib/idempotency';
import { queryKeys } from '@/shared/query';

export interface CheckoutVariables {
  token: string;
  idempotencyKey: string;
}

export interface CheckoutCallbacks {
  /** 202: payment is authorizing; the caller starts polling. 200: zero-fee, confirmed now. */
  onAccepted: (response: ApiResponse<Reservation>) => void;
  onRejected: (error: unknown) => void;
}

export function checkoutScope(reservationId: string, token: string): string {
  return `checkout:${reservationId}:${token}`;
}

function handleAccepted(queryClient: QueryClient, reservationId: string, callbacks: CheckoutCallbacks, response: ApiResponse<Reservation>, token: string): void {
  idempotencyKeys.settle(checkoutScope(reservationId, token));
  queryClient.setQueryData(queryKeys.reservations.detail(reservationId), response.data);
  callbacks.onAccepted(response);
}

function handleRejected(reservationId: string, callbacks: CheckoutCallbacks, error: unknown, token: string): void {
  if (!isAutoRetryableWrite(error)) idempotencyKeys.settle(checkoutScope(reservationId, token));
  callbacks.onRejected(error);
}

/**
 * Starts payment authorization. The key is per (reservation, token): changing the payment
 * method is a new intent, and retrying the same click reuses the key.
 */
export function useStartCheckout(reservationId: string, callbacks: CheckoutCallbacks) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ token, idempotencyKey }: CheckoutVariables) => checkoutReservation(reservationId, token, idempotencyKey),
    retry: shouldRetryWrite,
    retryDelay: writeRetryDelayMs,
    onSuccess: (response, variables) => handleAccepted(queryClient, reservationId, callbacks, response, variables.token),
    onError: (error, variables) => handleRejected(reservationId, callbacks, error, variables.token),
  });
}
