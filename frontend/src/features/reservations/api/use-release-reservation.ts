'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/query';
import { releaseReservation } from './reservation-repository';

/** Releasing is not a payment, so the cache is updated from the server response only. */
export function useReleaseReservation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => releaseReservation(id),
    onSuccess: (reservation) => {
      queryClient.setQueryData(queryKeys.reservations.detail(id), reservation);
      void queryClient.invalidateQueries({ queryKey: queryKeys.reservations.lists() });
    },
  });
}
