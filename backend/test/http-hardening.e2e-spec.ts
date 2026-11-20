import { createJameya, createMember, reserve } from './support/fixtures';
import { Harness, startHarness } from './support/harness';

let h: Harness;
beforeAll(async () => (h = await startHarness()));
afterAll(() => h.close());

test('marketplace list supports conditional GET (ETag → 304 Not Modified, no body)', async () => {
  const m = await createMember(h);
  const first = await h.http.get('/api/v1/jameyas?pageSize=5').set('Authorization', `Bearer ${m.token}`).expect(200);
  expect(first.headers.etag).toMatch(/^W\/".+"$/);
  const second = await h.http.get('/api/v1/jameyas?pageSize=5').set('Authorization', `Bearer ${m.token}`)
    .set('If-None-Match', first.headers.etag);
  expect([second.status, second.text]).toEqual([304, '']);
});

test('booking endpoints report RateLimit-* headers and return 429 + Retry-After when exceeded', async () => {
  const m = await createMember(h);
  const jameyas = await Promise.all(Array.from({ length: 6 }, () => createJameya(h)));
  const responses = [];
  for (const j of jameyas) responses.push(await reserve(h, m, j, 5));
  expect(responses[0].headers['ratelimit-limit']).toBe('5');
  expect(responses[0].headers['ratelimit-remaining']).toBe('4');
  const limited = responses[5];
  expect([limited.status, limited.body.error.code, limited.headers['ratelimit-remaining']]).toEqual([429, 'RATE_LIMITED', '0']);
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
});

test('health exposes circuit breaker states as an additive field', async () => {
  await h.http.get(`/api/v1/jameyas/${await createJameya(h)}`).set('Authorization', `Bearer ${(await createMember(h)).token}`);
  const res = await h.http.get('/api/v1/health').expect(200);
  expect(res.body.checks).toMatchObject({ database: 'up', redis: 'up' });
  expect(res.body.breakers).toMatchObject({ redis: 'CLOSED', kyc: 'CLOSED' });
});
