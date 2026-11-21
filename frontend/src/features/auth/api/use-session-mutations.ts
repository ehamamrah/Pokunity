'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { analytics } from '@/features/analytics';
import { redirectToLogin } from '@/shared/lib/navigation';
import { login, logout } from './auth-api';

/** Signing in discards every cached response from a previous account. */
export function useLogin(onSuccess: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    retry: false,
    onSuccess: () => {
      queryClient.clear();
      onSuccess();
    },
  });
}

/** Ends the local session: nothing from this member may survive in memory or in the analytics queue. */
function endSession(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.clear();
  analytics.reset();
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allSessions: boolean) => logout(allSessions),
    onSettled: () => {
      endSession(queryClient);
      redirectToLogin('signed_out');
    },
  });
}
