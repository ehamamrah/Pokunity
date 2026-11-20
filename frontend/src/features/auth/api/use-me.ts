'use client';

import { useQuery } from '@tanstack/react-query';
import { meOptions } from './auth-api';

/** Profile, KYC status and hold limits. Drives the KYC banner and eligibility hints. */
export function useMe() {
  return useQuery(meOptions());
}
