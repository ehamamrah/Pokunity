import { randomUUID } from 'node:crypto';

export interface Scenario {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  body?: () => string;
  /** Revalidation: one member sends the ETag of a previous 200 (expect 304 Not Modified). */
  revalidate?: boolean;
}

const eventsBody = (jameyaId: string) => () => JSON.stringify({
  events: Array.from({ length: 10 }, (_, i) => ({
    type: i % 2 ? 'click' : 'impression', jameyaId, position: i + 1, surface: 'marketplace_list',
    experiment: { key: 'ranking_v2', variant: 'treatment' }, occurredAt: new Date().toISOString(), id: randomUUID(),
  })).map(({ id: _id, ...e }) => e),
});

/** Read-heavy marketplace traffic plus the two hot writes that are not contention-bound. */
export function buildScenarios(jameyaId: string): Scenario[] {
  return [
    { name: 'GET /jameyas recommended p1', method: 'GET', path: '/api/v1/jameyas?sort=recommended&page=1&pageSize=20' },
    { name: 'GET /jameyas recommended p5', method: 'GET', path: '/api/v1/jameyas?sort=recommended&page=5&pageSize=20' },
    { name: 'GET /jameyas filtered+sorted', method: 'GET', path: '/api/v1/jameyas?sort=monthly_asc&minMonthly=50000&maxMonthly=200000&duration=12&pageSize=20' },
    { name: 'GET /jameyas/featured', method: 'GET', path: '/api/v1/jameyas/featured' },
    { name: 'GET /jameyas/:id', method: 'GET', path: `/api/v1/jameyas/${jameyaId}` },
    { name: 'GET /jameyas/:id/similar', method: 'GET', path: `/api/v1/jameyas/${jameyaId}/similar` },
    { name: 'GET /reservations', method: 'GET', path: '/api/v1/reservations' },
    { name: 'GET /me', method: 'GET', path: '/api/v1/me' },
    { name: 'POST /events (10/batch)', method: 'POST', path: '/api/v1/events', body: eventsBody(jameyaId) },
    ...revalidations(jameyaId),
  ];
}

/** Conditional GETs: the client already holds the current ETag (browser/BFF revalidation). */
function revalidations(jameyaId: string): Scenario[] {
  return [
    { name: 'GET /jameyas p1 revalidate (304)', method: 'GET', path: '/api/v1/jameyas?sort=recommended&page=1&pageSize=20', revalidate: true },
    { name: 'GET /jameyas/:id revalidate (304)', method: 'GET', path: `/api/v1/jameyas/${jameyaId}`, revalidate: true },
    { name: 'GET /me revalidate (304)', method: 'GET', path: '/api/v1/me', revalidate: true },
  ];
}
