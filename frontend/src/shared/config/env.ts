/**
 * Browser-visible API base. In the browser this is the same-origin BFF (`/api/v1`),
 * which forwards to the backend at runtime (see src/server/bff).
 */
export const API_BASE_URL: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

/** Session routes (login/logout) live on the BFF outside the proxied `/api/v1` namespace. */
export const SESSION_BASE_URL: string = API_BASE_URL.replace(/\/api\/v1$/, '/api');

/** Dev-only MSW mock backend. Off unless explicitly enabled at build/run time. */
export const MOCKING_ENABLED: boolean = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';
