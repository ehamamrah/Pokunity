import { http, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { apiClient } from '@/shared/api-client';
import { fetchJameyaPage } from './jameya-catalog';
import { DEFAULT_FILTERS } from '../model/filters';

it('takes the freshness timestamp from X-As-Of, not the body, so a 304 can refresh it', async () => {
  server.use(
    http.get('*/api/v1/jameyas', () =>
      HttpResponse.json({ data: [], meta: { page: 1, pageSize: 20, total: 0, asOf: '2026-01-01T00:00:00.000Z' } }, { headers: { 'X-As-Of': '2030-01-01T00:00:00.000Z' } }),
    ),
  );
  const page = await fetchJameyaPage(DEFAULT_FILTERS, 1, apiClient);
  expect(page.meta.asOf).toBe('2030-01-01T00:00:00.000Z');
});
