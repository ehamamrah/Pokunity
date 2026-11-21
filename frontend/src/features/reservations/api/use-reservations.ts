'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/query';
import { fetchReservations, RESERVATION_PAGE_SIZE } from './reservation-repository';

/** One page at a time. The previous page stays on screen while the next one loads. */
export function useReservations(page: number) {
  return useQuery({
    queryKey: queryKeys.reservations.list(page, RESERVATION_PAGE_SIZE),
    queryFn: () => fetchReservations(page, RESERVATION_PAGE_SIZE),
    staleTime: 0,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
}
