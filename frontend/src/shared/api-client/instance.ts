import { API_BASE_URL, SESSION_BASE_URL } from '../config/env';
import { createApiClient } from './client';

/** Client for the proxied backend namespace (through the BFF). */
export const apiClient = createApiClient({ baseUrl: API_BASE_URL });

/** Client for BFF-only session routes (login/logout). */
export const sessionClient = createApiClient({ baseUrl: SESSION_BASE_URL });
