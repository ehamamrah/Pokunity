'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
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

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      redirectToLogin('signed_out');
    },
  });
}
