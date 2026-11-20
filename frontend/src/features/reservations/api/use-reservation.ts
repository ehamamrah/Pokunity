'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/query';
import { pollIntervalFor } from '../model/poll-policy';
import { fetchReservation } from './reservation-repository';

/**
 * Authoritative reservation status. The poll interval depends on the status and on how
 * long the payment has been pending, and stops (false) on any terminal status.
 */
export function useReservation(id: string) {
  return useQuery({
    queryKey: queryKeys.reservations.detail(id),
    queryFn: () => fetchReservation(id),
    staleTime: 0,
    refetchInterval: (query) => {
      const reservation = query.state.data;
      const pendingElapsedMs = reservation ? Date.now() - Date.parse(reservation.updatedAt) : 0;
      return pollIntervalFor(reservation?.status, pendingElapsedMs);
    },
    refetchIntervalInBackground: true,
  });
}
