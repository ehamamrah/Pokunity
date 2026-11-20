import { apiClient, sessionClient } from '@/shared/api-client';
import { meSchema, sessionResponseSchema } from '@/shared/contract';
import { z } from 'zod';
import type { LoginCredentials } from '../model/login-schema';

/** Login goes to the BFF, which keeps the JWT in an httpOnly cookie. The browser never sees it. */
export async function login(credentials: LoginCredentials) {
  const { data } = await sessionClient.post('/session', sessionResponseSchema, { body: credentials });
  return data;
}

export async function logout(): Promise<void> {
  await sessionClient.delete('/session', z.unknown());
}

export async function fetchMe() {
  const { data } = await apiClient.get('/me', meSchema);
  return data;
}
