import type { z } from 'zod';
import type {
  experimentSchema,
  failureReasonSchema,
  jameyaBadgeSchema,
  jameyaDetailSchema,
  jameyaSummarySchema,
  kycStatusSchema,
  listMetaSchema,
  meSchema,
  reservationSchema,
  reservationStatusSchema,
  restrictionReasonSchema,
  blockingReasonSchema,
  riskTierSchema,
  seatSchema,
  seatStatusSchema,
  userRefSchema,
} from './schemas';

export type UserRef = z.infer<typeof userRefSchema>;
export type Me = z.infer<typeof meSchema>;
export type KycStatus = z.infer<typeof kycStatusSchema>;
export type RiskTier = z.infer<typeof riskTierSchema>;
export type SeatStatus = z.infer<typeof seatStatusSchema>;
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type FailureReason = z.infer<typeof failureReasonSchema>;
export type JameyaBadge = z.infer<typeof jameyaBadgeSchema>;
export type RestrictionReason = z.infer<typeof restrictionReasonSchema>;
export type BlockingReason = z.infer<typeof blockingReasonSchema>;
export type Experiment = z.infer<typeof experimentSchema>;
export type ListMeta = z.infer<typeof listMetaSchema>;
export type JameyaSummary = z.infer<typeof jameyaSummarySchema>;
export type JameyaDetail = z.infer<typeof jameyaDetailSchema>;
export type Seat = z.infer<typeof seatSchema>;
export type Reservation = z.infer<typeof reservationSchema>;
