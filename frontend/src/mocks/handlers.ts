import { http, HttpResponse } from 'msw';
import { SEEDED_VIEWER, findJameyaDef, JAMEYA_DEFS } from './fixtures';
import { db, activeReservationFor, nextId, viewerActiveHoldIn, type StoredReservation } from './db';
import { holdExpiry, settle } from './lifecycle';
import { detailFor, reservationView, summaryFor } from './views';
import { PAYMENT_TOKENS } from './payment-simulator';
import { applyListQuery } from './list-query';

const BASE = '*/api/v1';
const SESSION = '*/api/session';
const PASSWORD = 'Pokunity123!';
const VIEWER_USER = { id: SEEDED_VIEWER.id, name: SEEDED_VIEWER.name, email: SEEDED_VIEWER.email };

type Body = Record<string, unknown> | null;

function errorBody(code: string, message: string, details: Record<string, unknown> | null = null) {
  return { error: { code, message, details, traceId: '8c1f6a0e-3a51-4c4e-9a43-2b1c9d1f7e10' } };
}

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return HttpResponse.json(body as Record<string, unknown>, { status, headers });
}

async function readBody(request: Request): Promise<Body> {
  const text = await request.text();
  return text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : null;
}

function logRequest(request: Request, body: unknown): string | null {
  const key = request.headers.get('idempotency-key');
  db.requests.push({ method: request.method, path: new URL(request.url).pathname, idempotencyKey: key, body });
  return key;
}

function isValidLogin(body: Body): boolean {
  return body?.email === SEEDED_VIEWER.email && body.password === PASSWORD;
}

/** Idempotency: same key + same body replays the stored response; same key + other body is 422. */
function replayOrNull(key: string, fingerprint: string): Response | null {
  const stored = db.idempotency.get(key);
  if (!stored) return null;
  if (stored.fingerprint !== fingerprint) {
    return json(errorBody('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key was used with a different request.'), 422);
  }
  return json(stored.body, stored.status, { 'Idempotent-Replayed': 'true' });
}

function remember(key: string, fingerprint: string, status: number, body: unknown): Response {
  db.idempotency.set(key, { fingerprint, status, body });
  return json(body, status);
}

function loginHandlers() {
  return [
    http.post(`${BASE}/auth/login`, async ({ request }) => {
      const body = await readBody(request);
      if (!isValidLogin(body)) return json(errorBody('INVALID_CREDENTIALS', 'Invalid email or password.'), 401);
      return json({ accessToken: 'eyJhbGciOiJIUzI1NiJ9.mock.signature', expiresIn: 3600, user: VIEWER_USER });
    }),
    http.post(`${SESSION}`, async ({ request }) => {
      const body = await readBody(request);
      if (!isValidLogin(body)) return json(errorBody('INVALID_CREDENTIALS', 'Invalid email or password.'), 401);
      return json({ user: VIEWER_USER, expiresIn: 3600 });
    }),
    http.delete(`${SESSION}`, () => new HttpResponse(null, { status: 204 })),
  ];
}

function profileHandler() {
  return http.get(`${BASE}/me`, () =>
    json({
      id: SEEDED_VIEWER.id,
      name: SEEDED_VIEWER.name,
      email: SEEDED_VIEWER.email,
      kycStatus: db.viewerKyc,
      kycCheckedAt: new Date().toISOString(),
      riskTier: db.viewerRisk,
      preferences: { typicalMonthlyAmount: 100000, preferredDurations: [10, 12] },
      limits: { maxActiveHolds: 3, activeHolds: [...db.reservations.values()].filter((r) => r.status === 'HELD').length },
    }),
  );
}

/** v1.1 freshness: X-As-Of on every read, and an ETag over the content without timestamps. */
function freshJson(body: Record<string, unknown>, request: Request, cacheControl: string): Response {
  const asOf = new Date().toISOString();
  const etag = `W/"${hashOf(stripVolatile(body))}"`;
  const headers = { ETag: etag, 'Cache-Control': cacheControl, 'X-As-Of': asOf };
  if (request.headers.get('if-none-match') === etag) return new HttpResponse(null, { status: 304, headers });
  return json(body, 200, headers);
}

function stripVolatile(body: Record<string, unknown>): string {
  return JSON.stringify(body, (key, value: unknown) => (key === 'asOf' ? undefined : value));
}

function hashOf(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(16);
}

function similarFor(id: string, nowMs: number): Record<string, unknown> | null {
  const def = findJameyaDef(id);
  if (!def) return null;
  const data = JAMEYA_DEFS.filter((other) => other.id !== id).slice(0, 5).map((other) => summaryFor(other, nowMs));
  return { data, meta: { asOf: new Date(nowMs).toISOString(), experiment: { key: 'ranking_v2', variant: 'treatment' } } };
}

function listHandlers() {
  return [
    http.get(`${BASE}/jameyas`, ({ request }) => freshJson(applyListQuery(new URL(request.url).searchParams, Date.now()), request, 'private, max-age=5')),
    http.get(`${BASE}/jameyas/featured`, ({ request }) => {
      const data = JAMEYA_DEFS.filter((def) => def.featured).map((def) => summaryFor(def, Date.now()));
      return freshJson({ data, meta: { asOf: new Date().toISOString() } }, request, 'private, max-age=5');
    }),
    http.get(`${BASE}/jameyas/:id/similar`, ({ params }) => {
      const body = similarFor(String(params.id), Date.now());
      return body ? json(body, 200, { 'X-As-Of': new Date().toISOString() }) : json(errorBody('NOT_FOUND', 'Jameya not found.'), 404);
    }),
  ];
}

function detailHandlers() {
  return [
    http.get(`${BASE}/jameyas/:id`, ({ params, request }) => {
      const def = findJameyaDef(String(params.id));
      if (!def) return json(errorBody('NOT_FOUND', 'Jameya not found.'), 404);
      return freshJson(detailFor(def, Date.now()), request, 'private, no-cache');
    }),
  ];
}

/** Ordered checks, mirroring docs/api/reservations.md (KYC, limits, restriction, seat claim). */
function reserveOutcome(body: Body): [number, unknown] {
  const jameyaId = typeof body?.jameyaId === 'string' ? body.jameyaId : '';
  const seatNumber = typeof body?.seatNumber === 'number' ? body.seatNumber : 0;
  const def = findJameyaDef(jameyaId);
  if (!def || seatNumber < 1) return [404, errorBody('NOT_FOUND', 'Jameya not found.')];
  if (db.viewerKyc !== 'VERIFIED') return [403, errorBody('KYC_REQUIRED', 'Identity verification is required.')];
  const active = viewerActiveHoldIn(def.id);
  if (active) return [409, errorBody('ACTIVE_RESERVATION_EXISTS', 'You already hold a seat in this Jameya.', { reservationId: active.id })];
  if (db.viewerRisk === 'HIGH' && seatNumber <= 3) return [403, errorBody('RISK_RESTRICTED', 'This seat is restricted for your risk tier.')];
  const taken = def.takenSeats.includes(seatNumber) || def.heldSeats.includes(seatNumber) || Boolean(activeReservationFor(def.id, seatNumber));
  if (taken) return [409, errorBody('SEAT_UNAVAILABLE', `Seat ${seatNumber} is no longer available.`, { seatNumber })];
  return [201, createHold(def.id, seatNumber, def.maxFee, def.durationMonths)];
}

/** Same fee curve as the seat map: earlier payouts cost more. */
function feeForHold(seatNumber: number, maxFee: number, duration: number): number {
  return Math.round((maxFee * (duration - seatNumber)) / Math.max(1, duration - 1));
}

function holdRecord(jameyaId: string, seatNumber: number, fee: number, nowMs: number): StoredReservation {
  const iso = new Date(nowMs).toISOString();
  const monthlyAmount = findJameyaDef(jameyaId)?.monthlyAmount ?? 0;
  return {
    id: nextId('d1000000'), jameyaId, seatNumber, fee, monthlyAmount, status: 'HELD',
    failureReason: null, paymentId: null, paymentStatus: null,
    expiresAt: holdExpiry(nowMs), createdAt: iso, updatedAt: iso,
  };
}

function createHold(jameyaId: string, seatNumber: number, maxFee: number, duration: number) {
  const now = Date.now();
  const reservation = holdRecord(jameyaId, seatNumber, feeForHold(seatNumber, maxFee, duration), now);
  db.reservations.set(reservation.id, reservation);
  return reservationView(reservation, now);
}

function createReservationHandler() {
  return http.post(`${BASE}/reservations`, async ({ request }) => {
    const body = await readBody(request);
    const key = logRequest(request, body);
    if (!key) return json(errorBody('VALIDATION_ERROR', 'Idempotency-Key header is required.'), 400);
    const fingerprint = JSON.stringify(body);
    const replay = replayOrNull(key, fingerprint);
    if (replay) return replay;
    const [status, payload] = reserveOutcome(body);
    return remember(key, fingerprint, status, payload);
  });
}

function withReservation(id: string, respond: (r: StoredReservation) => Response): Response {
  const stored = db.reservations.get(id);
  if (!stored) return json(errorBody('NOT_FOUND', 'Reservation not found.'), 404);
  return respond(settle(stored, Date.now()));
}

function releaseHold(stored: StoredReservation): Response {
  if (stored.status === 'CANCELLED') return json(reservationView(stored, Date.now()));
  if (stored.status !== 'HELD') {
    return json(errorBody('INVALID_STATE', 'This reservation cannot be released now.', { status: stored.status }), 409);
  }
  const cancelled: StoredReservation = { ...stored, status: 'CANCELLED', updatedAt: new Date().toISOString() };
  db.reservations.set(stored.id, cancelled);
  return json(reservationView(cancelled, Date.now()));
}

/** Free seats confirm instantly (200); paid seats start authorization and resolve later (202). */
function startPayment(current: StoredReservation, token: string, now: number): StoredReservation {
  if (current.fee === 0) return { ...current, status: 'CONFIRMED', updatedAt: new Date(now).toISOString() };
  return {
    ...current,
    status: 'PAYMENT_PENDING',
    paymentId: nextId('e1000000'),
    paymentStatus: 'AUTHORIZING',
    updatedAt: new Date(now).toISOString(),
    pay: { token, startedAt: now },
  };
}

function checkoutPrecheck(current: StoredReservation, token: string): Response | null {
  if (!(PAYMENT_TOKENS as readonly string[]).includes(token)) return json(errorBody('VALIDATION_ERROR', 'Unknown paymentMethodToken.'), 400);
  if (current.status === 'EXPIRED') return json(errorBody('RESERVATION_EXPIRED', 'Your hold expired.'), 410);
  if (current.status !== 'HELD') return json(errorBody('INVALID_STATE', 'Reservation is not awaiting payment.', { status: current.status }), 409);
  return null;
}

function checkoutResponse(key: string, fingerprint: string, id: string, token: string): Response {
  const stored = db.reservations.get(id);
  if (!stored) return json(errorBody('NOT_FOUND', 'Reservation not found.'), 404);
  const current = settle(stored, Date.now());
  const rejected = checkoutPrecheck(current, token);
  if (rejected) return rejected;
  const now = Date.now();
  const next = startPayment(current, token, now);
  db.reservations.set(id, next);
  return remember(key, fingerprint, next.status === 'CONFIRMED' ? 200 : 202, reservationView(next, now));
}

function checkoutHandler() {
  return http.post(`${BASE}/reservations/:id/checkout`, async ({ request, params }) => {
    const body = await readBody(request);
    logRequest(request, body);
    const key = request.headers.get('idempotency-key');
    if (!key) return json(errorBody('VALIDATION_ERROR', 'Idempotency-Key header is required.'), 400);
    const fingerprint = JSON.stringify({ id: params.id, body });
    const token = typeof body?.paymentMethodToken === 'string' ? body.paymentMethodToken : '';
    return replayOrNull(key, fingerprint) ?? checkoutResponse(key, fingerprint, String(params.id), token);
  });
}

function reservationHandlers() {
  return [
    http.get(`${BASE}/reservations`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const page = Number(params.get('page') ?? 1);
      const pageSize = Number(params.get('pageSize') ?? 20);
      const all = [...db.reservations.values()].map((r) => reservationView(r, Date.now())).reverse();
      return json({ data: all.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: all.length } });
    }),
    http.get(`${BASE}/reservations/:id`, ({ params }) => withReservation(String(params.id), (r) => json(reservationView(r, Date.now())))),
    http.delete(`${BASE}/reservations/:id`, ({ params }) => withReservation(String(params.id), releaseHold)),
    checkoutHandler(),
  ];
}

function eventsHandler() {
  return http.post(`${BASE}/events`, async ({ request }) => {
    const body = await readBody(request);
    const events = Array.isArray(body?.events) ? (body.events as unknown[]) : [];
    db.events.push(...events);
    return json({ accepted: events.length }, 202);
  });
}

export const handlers = [
  ...loginHandlers(),
  profileHandler(),
  ...listHandlers(),
  ...detailHandlers(),
  createReservationHandler(),
  ...reservationHandlers(),
  eventsHandler(),
];
