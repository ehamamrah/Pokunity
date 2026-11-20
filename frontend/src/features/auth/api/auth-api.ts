import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient, sessionClient, type ApiClient } from '@/shared/api-client';
import { meSchema, sessionResponseSchema } from '@/shared/contract';
import { TIMING } from '@/shared/config/timing';
import { queryKeys } from '@/shared/query';
import type { LoginCredentials } from '../model/login-schema';

/** Login goes to the BFF, which keeps the JWT in an httpOnly cookie. The browser never sees it. */
export async function login(credentials: LoginCredentials) {
  const { data } = await sessionClient.post('/session', sessionResponseSchema, { body: credentials });
  return data;
}

export async function logout(): Promise<void> {
  await sessionClient.delete('/session', z.unknown());
}

export async function fetchMe(client: ApiClient = apiClient) {
  const { data } = await client.get('/me', meSchema);
  return data;
}

/** Shared by the client hook and the server prefetch, so both use the same key and function. */
export function meOptions(client: ApiClient = apiClient) {
  return queryOptions({
    queryKey: queryKeys.me(),
    queryFn: () => fetchMe(client),
    staleTime: TIMING.meStaleTimeMs,
    retry: false,
  });
}
