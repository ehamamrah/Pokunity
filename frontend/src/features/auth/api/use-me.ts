'use client';

import { useQuery } from '@tanstack/react-query';
import { TIMING } from '@/shared/config/timing';
import { queryKeys } from '@/shared/query';
import { fetchMe } from './auth-api';

/** Profile, KYC status and hold limits. Drives the KYC banner and eligibility hints. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: fetchMe,
    staleTime: TIMING.meStaleTimeMs,
    retry: false,
  });
}
