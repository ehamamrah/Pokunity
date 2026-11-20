'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/query';
import { fetchReservations } from './reservation-repository';

export function useReservations() {
  return useQuery({
    queryKey: queryKeys.reservations.list([]),
    queryFn: () => fetchReservations(),
    staleTime: 0,
    refetchInterval: 15_000,
  });
}
