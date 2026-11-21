// End-to-end smoke test through the running docker stack (run: node scripts/e2e-smoke.mjs).
// End-to-end through the running stack, with a browser-like client: gzip/br accepted, session cookie,
// conditional requests. Runs in Node 20+ fetch (decodes Content-Encoding like a browser would).
const BASE = 'http://localhost:3000';
const API = `${BASE}/api/v1`;
const HEADERS = { 'accept-encoding': 'gzip, deflate, br', accept: 'application/json' };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

function cookieFrom(res) {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0];
}
async function json(res) { return res.json(); }

async function login(email) {
  const res = await fetch(`${BASE}/api/session`, { method: 'POST', headers: { ...HEADERS, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Pokunity123!' }) });
  return { status: res.status, cookie: cookieFrom(res), body: res.status === 200 ? await json(res) : null, setCookie: res.headers.get('set-cookie') ?? '' };
}

async function main() {
  // 1. Login: cookie is httpOnly and the token is not in the body.
  const sara = await login('sara@pokunity.app');
  check('login returns 200 and an httpOnly session cookie', sara.status === 200 && /httponly/i.test(sara.setCookie), `status ${sara.status}`);
  check('token is not exposed in the login body', sara.body && !JSON.stringify(sara.body).includes('eyJ'));
  const cookie = sara.cookie;

  // 2. List through the BFF, with gzip negotiated: must decode as JSON.
  const listRes = await fetch(`${API}/jameyas?pageSize=20`, { headers: { ...HEADERS, cookie } });
  const list = await listRes.json().catch(() => null);
  check('list decodes as JSON through the BFF with gzip negotiated', listRes.status === 200 && Array.isArray(list?.data), `status ${listRes.status}, items ${list?.data?.length}`);
  const etag = listRes.headers.get('etag');
  const asOf = listRes.headers.get('x-as-of');
  check('list carries ETag, Cache-Control and X-As-Of', Boolean(etag) && Boolean(asOf) && /max-age=5/.test(listRes.headers.get('cache-control') ?? ''), `etag ${etag}, as-of ${asOf}`);

  // 3. Conditional revalidation: same content answers 304, X-As-Of still refreshed.
  await new Promise((r) => setTimeout(r, 1200));
  const revalidate = await fetch(`${API}/jameyas?pageSize=20`, { headers: { ...HEADERS, cookie, 'if-none-match': etag } });
  const newAsOf = revalidate.headers.get('x-as-of');
  const sameContent = revalidate.status === 304;
  check('revalidation with If-None-Match returns 304 (unchanged content)', sameContent, `status ${revalidate.status}`);
  check('a 304 still carries X-As-Of (the server verification time, never missing)', sameContent && Boolean(newAsOf), `as-of ${newAsOf}`);

  // 4. Detail: no-cache revalidates, experiment present, seat map from the server.
  const jameyaId = list.data[0].id;
  const detailRes = await fetch(`${API}/jameyas/${jameyaId}`, { headers: { ...HEADERS, cookie } });
  const detail = await detailRes.json();
  check('detail carries experiment (v1.1) and a seat map', detailRes.status === 200 && detail.experiment?.key && detail.seats?.length > 0);
  const dEtag = detailRes.headers.get('etag');
  const dReval = await fetch(`${API}/jameyas/${jameyaId}`, { headers: { ...HEADERS, cookie, 'if-none-match': dEtag ?? '' } });
  check('detail revalidates with 304 (no-cache + ETag)', dReval.status === 304, `status ${dReval.status}`);

  // 5. Similar Jameyas.
  const simRes = await fetch(`${API}/jameyas/${jameyaId}/similar`, { headers: { ...HEADERS, cookie } });
  const sim = await simRes.json();
  check('similar returns up to 5 Jameyas, excluding the source', simRes.status === 200 && sim.data.length <= 5 && !sim.data.some((j) => j.id === jameyaId), `items ${sim.data.length}`);

  // 6. Reserve (free or paid, any open seat), then checkout and poll to a server-confirmed result.
  const open = detail.seats.find((s) => s.status === 'AVAILABLE' && !s.restricted);
  if (!open) { check('an open seat is available for the booking path', false); return finish(); }
  const key = crypto.randomUUID();
  const reserve = await fetch(`${API}/reservations`, { method: 'POST', headers: { ...HEADERS, cookie, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify({ jameyaId, seatNumber: open.seatNumber }) });
  const reservation = reserve.status === 201 ? await reserve.json() : null;
  check('reserve returns 201 HELD through the BFF', reserve.status === 201 && reservation?.status === 'HELD', `status ${reserve.status}`);
  if (!reservation) return finish();
  const replay = await fetch(`${API}/reservations`, { method: 'POST', headers: { ...HEADERS, cookie, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify({ jameyaId, seatNumber: open.seatNumber }) });
  check('same Idempotency-Key replays (Idempotent-Replayed relayed)', replay.headers.get('idempotent-replayed') === 'true', `status ${replay.status}`);

  const pay = await fetch(`${API}/reservations/${reservation.id}/checkout`, { method: 'POST', headers: { ...HEADERS, cookie, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ paymentMethodToken: 'tok_success' }) });
  check('checkout accepted (202 paying, or 200 zero-fee confirmed)', pay.status === 202 || pay.status === 200, `status ${pay.status}`);
  let finalStatus = null;
  for (let attempt = 0; attempt < 20 && finalStatus !== 'CONFIRMED'; attempt += 1) {
    await new Promise((r) => setTimeout(r, 700));
    const poll = await fetch(`${API}/reservations/${reservation.id}`, { headers: { ...HEADERS, cookie } });
    finalStatus = (await poll.json()).status;
  }
  check('checkout poll reaches CONFIRMED from the server', finalStatus === 'CONFIRMED', `final ${finalStatus}`);

  // 7. Reservations pagination meta.
  const resList = await fetch(`${API}/reservations?page=1&pageSize=2`, { headers: { ...HEADERS, cookie } });
  const resBody = await resList.json();
  check('reservations are paginated with meta', resList.status === 200 && resBody.meta?.pageSize === 2 && typeof resBody.meta?.total === 'number', `meta ${JSON.stringify(resBody.meta)}`);

  // 8. Logout: cookie cleared, token revoked at the backend, old token rejected.
  const jwt = cookie.split('=').slice(1).join('=');
  const logout = await fetch(`${BASE}/api/session`, { method: 'DELETE', headers: { ...HEADERS, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ allSessions: false }) });
  check('logout returns 204, clears the cookie and sends Clear-Site-Data', logout.status === 204 && /max-age=0/i.test(logout.headers.get('set-cookie') ?? '') && logout.headers.get('clear-site-data') === '"cache"', `status ${logout.status}`);
  const direct = await fetch(`${API.replace(':3000', ':4000')}/me`, { headers: { authorization: `Bearer ${jwt}` } });
  check('revoked token is rejected by the backend (401)', direct.status === 401, `status ${direct.status}`);
  const replayed = await fetch(`${API}/me`, { headers: { ...HEADERS, cookie } });
  check('old cookie no longer reaches the API (401)', replayed.status === 401, `status ${replayed.status}`);

  // 9. Log out of all devices invalidates every token of the member, including one from another login.
  const a = await login('sara@pokunity.app');
  const b = await login('sara@pokunity.app');
  await fetch(`${BASE}/api/session`, { method: 'DELETE', headers: { ...HEADERS, cookie: a.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ allSessions: true }) });
  const other = await fetch(`${API}/me`, { headers: { ...HEADERS, cookie: b.cookie } });
  check('logout-all revokes sessions on other devices (401)', other.status === 401, `status ${other.status}`);
  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((error) => { console.error('E2E crashed:', error); process.exit(2); });
