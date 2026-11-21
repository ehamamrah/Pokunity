import { TokenDenylist } from '../src/modules/auth/infrastructure/token-denylist';
import { TokenService } from '../src/modules/auth/infrastructure/token.service';
import { createJameya, createMember, Member, reserve } from './support/fixtures';
import { Harness, startHarness } from './support/harness';

let h: Harness;
beforeAll(async () => (h = await startHarness()));
afterAll(() => h.close());
afterEach(() => jest.restoreAllMocks());

const me = (token: string) => h.http.get('/api/v1/me').set('Authorization', `Bearer ${token}`);
const logout = (token: string, body: object = {}) =>
  h.http.post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`).send(body);

/** A second, independent session (another device) of the same member. */
async function secondSession(m: Member): Promise<string> {
  const { rows } = await h.db.query<{ token_version: number }>('SELECT token_version FROM users WHERE id = $1', [m.id]);
  return h.app.get(TokenService).issue({ id: m.id, email: `${m.id}@test.pokunity.app` }, rows[0].token_version);
}

test('logout revokes this token only; it is idempotent (204 again)', async () => {
  const m = await createMember(h);
  const other = await secondSession(m);
  await logout(m.token).expect(204);
  expect((await me(m.token)).status).toBe(401);
  await logout(m.token).expect(204);
  await me(other).expect(200);
});

test('allSessions revokes every token of the member; a fresh login works', async () => {
  const m = await createMember(h);
  const other = await secondSession(m);
  await logout(m.token, { allSessions: true }).expect(204);
  expect([(await me(m.token)).status, (await me(other)).status]).toEqual([401, 401]);
  await me(await secondSession(m)).expect(200);
  const { rows } = await h.db.query(`SELECT action FROM audit_log WHERE entity_id = $1 AND action LIKE 'auth.logout%'`, [m.id]);
  expect(rows).toEqual([{ action: 'auth.logout.all_sessions' }]);
});

test('denylist unavailable: reads still work, money-moving routes fail closed with 503', async () => {
  const [jameyaId, m] = await Promise.all([createJameya(h), createMember(h)]);
  jest.spyOn(h.app.get(TokenDenylist), 'status').mockResolvedValue('unknown');
  await me(m.token).expect(200);
  const res = await reserve(h, m, jameyaId, 3);
  expect([res.status, res.body.error.code, res.headers['retry-after']]).toEqual([503, 'SERVICE_UNAVAILABLE', '5']);
});

test('logout while the denylist is unavailable escalates to all sessions (never silently ignored)', async () => {
  const m = await createMember(h);
  const other = await secondSession(m);
  jest.spyOn(h.app.get(TokenDenylist), 'revoke').mockResolvedValue(false);
  await logout(m.token).expect(204);
  expect([(await me(m.token)).status, (await me(other)).status]).toEqual([401, 401]);
});

test('logout requires a valid token and is rate limited per member', async () => {
  await h.http.post('/api/v1/auth/logout').expect(401);
  const m = await createMember(h);
  const responses = [];
  for (let i = 0; i < 11; i += 1) responses.push((await logout(m.token)).status);
  expect(responses.slice(0, 10).every((s) => s === 204)).toBe(true);
  expect(responses[10]).toBe(429);
});
