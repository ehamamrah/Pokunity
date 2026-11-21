/**
 * Runtime validation of the frozen API contract (docs/api/openapi.yaml).
 * Every response is parsed here at the API-client boundary; a mismatch becomes a
 * ContractError instead of silently propagating malformed data into the UI.
 */
import { z } from 'zod';

const uuid = z.string().uuid();
const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');
/** Money: integer minor units (halalas), never negative. */
export const moneySchema = z.number().int().nonnegative();

export const currencySchema = z.literal('SAR');
export const kycStatusSchema = z.enum(['VERIFIED', 'PENDING', 'REJECTED', 'UNKNOWN']);
export const riskTierSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const seatStatusSchema = z.enum(['AVAILABLE', 'HELD', 'TAKEN']);
export const reservationStatusSchema = z.enum([
  'HELD',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
]);
export const paymentStatusSchema = z.enum(['AUTHORIZING', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'FAILED']);
export const jameyaBadgeSchema = z.enum(['FEATURED', 'ALMOST_FULL', 'STARTING_SOON', 'NEW', 'BEST_MATCH']);
export const restrictionReasonSchema = z.enum(['KYC_REQUIRED', 'RISK_TIER', 'KYC_UNAVAILABLE']);
/** v1.1: a viewer can be blocked by the hold limit as well as by a restriction. */
export const blockingReasonSchema = z.enum(['KYC_REQUIRED', 'RISK_TIER', 'KYC_UNAVAILABLE', 'HOLD_LIMIT']);
export const failureReasonSchema = z.enum([
  'PAYMENT_DECLINED',
  'PAYMENT_TIMEOUT',
  'HOLD_EXPIRED',
  'SEAT_CONFLICT',
]);
export const experimentSchema = z.object({
  key: z.string(),
  variant: z.enum(['control', 'treatment']),
});

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string().optional(),
    details: z.record(z.string(), z.unknown()).nullish(),
    traceId: z.string().nullish(),
  }),
});

export const userRefSchema = z.object({
  id: uuid,
  name: z.string(),
  email: z.string().email(),
});

export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: userRefSchema,
});

/** BFF response from POST /api/session: the token never reaches the browser. */
export const sessionResponseSchema = z.object({
  user: userRefSchema,
  expiresIn: z.number().int().positive(),
});

export const meSchema = userRefSchema.extend({
  kycStatus: kycStatusSchema,
  kycCheckedAt: isoDateTime.nullish(),
  riskTier: riskTierSchema,
  preferences: z.object({
    typicalMonthlyAmount: moneySchema.nullish(),
    preferredDurations: z.array(z.number().int()),
  }),
  limits: z.object({
    maxActiveHolds: z.number().int(),
    activeHolds: z.number().int(),
  }),
});

export const listMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  asOf: isoDateTime,
  experiment: experimentSchema.optional(),
});

export const jameyaSummarySchema = z.object({
  id: uuid,
  name: z.string(),
  monthlyAmount: moneySchema,
  currency: currencySchema,
  durationMonths: z.number().int().positive(),
  totalSeats: z.number().int().positive(),
  seatsAvailable: z.number().int().nonnegative(),
  payoutAmount: moneySchema,
  minFee: moneySchema,
  maxFee: moneySchema,
  startDate: isoDate,
  featured: z.boolean(),
  badges: z.array(jameyaBadgeSchema),
  ranking: z.object({
    score: z.number(),
    reasons: z.array(z.string()),
  }),
  asOf: isoDateTime,
});

export const jameyaListSchema = z.object({
  data: z.array(jameyaSummarySchema),
  meta: listMetaSchema,
});

export const featuredListSchema = z.object({
  data: z.array(jameyaSummarySchema),
  meta: z.object({ asOf: isoDateTime }),
});

export const seatSchema = z.object({
  seatNumber: z.number().int().positive(),
  payoutMonth: yearMonth,
  fee: moneySchema,
  status: seatStatusSchema,
  heldByViewer: z.boolean(),
  restricted: z.boolean(),
  restrictionReason: restrictionReasonSchema.nullable(),
});

export const jameyaDetailSchema = jameyaSummarySchema.extend({
  seats: z.array(seatSchema),
  viewer: z.object({
    canReserve: z.boolean(),
    blockingReason: blockingReasonSchema.nullable(),
    activeReservationId: uuid.nullable(),
  }),
  /** v1.1: the viewer's A/B assignment, so deep links can attribute events. */
  experiment: experimentSchema.optional(),
});

export const similarListSchema = z.object({
  data: z.array(jameyaSummarySchema),
  meta: z.object({ asOf: isoDateTime, experiment: experimentSchema.optional() }),
});

export const paymentSummarySchema = z.object({
  id: uuid,
  status: paymentStatusSchema,
  amount: moneySchema,
  currency: currencySchema,
  /** v1.1: latest time the outcome is guaranteed; null once terminal. */
  resolveBy: isoDateTime.nullish(),
});

export const reservationSchema = z.object({
  id: uuid,
  jameyaId: uuid,
  jameyaName: z.string(),
  seatNumber: z.number().int().positive(),
  fee: moneySchema,
  monthlyAmount: moneySchema,
  currency: currencySchema,
  status: reservationStatusSchema,
  expiresAt: isoDateTime,
  failureReason: failureReasonSchema.nullable(),
  payment: paymentSummarySchema.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

/** v1.1 reservation pagination meta (no asOf: reservations are never cached). */
export const pageMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const reservationListSchema = z.object({
  data: z.array(reservationSchema),
  meta: pageMetaSchema,
});

export const acceptedEventsSchema = z.object({
  accepted: z.number().int().nonnegative(),
});
