export const ROUTES = {
  home: '/',
  login: '/login',
  reservations: '/reservations',
  jameya: (id: string): string => `/jameyas/${id}`,
  reservation: (id: string): string => `/reservations/${id}`,
} as const;

/** Only same-origin relative paths may be used as post-login redirects (no open redirects). */
export function safeNextPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return ROUTES.home;
  return candidate;
}
