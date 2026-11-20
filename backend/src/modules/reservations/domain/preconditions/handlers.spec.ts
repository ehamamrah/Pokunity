import { AppError } from '../../../../shared/errors/app-error';
import { KycView } from '../../../users/domain/user.types';
import { isSeatRestricted } from '../../../users/domain/risk-policy';
import { buildLimitsChain, buildReservationChain } from './handlers';
import { ReservationAttempt } from './precondition';

const verified: KycView = { status: 'VERIFIED', checkedAt: '2026-11-21T10:00:00.000Z', stale: false };

function attempt(overrides: Partial<ReservationAttempt> = {}): ReservationAttempt {
  return {
    userId: 'u1', seatNumber: 11, totalSeats: 12, kyc: verified, riskTier: 'LOW', maxActiveHolds: 3,
    activeHolds: 0, activeReservationInJameya: null, isSeatRestricted, ...overrides,
  };
}

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return (error as AppError).code;
  }
}

const chain = buildReservationChain();
const run = (overrides: Partial<ReservationAttempt>) => codeOf(() => chain.handle(attempt(overrides)));

test('an eligible attempt passes the whole chain', () => {
  expect(run({})).toBeNull();
});

test('KYC is checked first and fails closed when status is unknown', () => {
  expect(run({ kyc: { status: 'PENDING', checkedAt: null, stale: false }, riskTier: 'HIGH', seatNumber: 1 })).toBe('KYC_REQUIRED');
  expect(run({ kyc: { status: 'UNKNOWN', checkedAt: null, stale: false } })).toBe('KYC_UNAVAILABLE');
  expect(run({ kyc: { status: 'REJECTED', checkedAt: null, stale: false } })).toBe('KYC_REQUIRED');
});

test('an active reservation in the same Jameya wins over the hold limit', () => {
  expect(run({ activeReservationInJameya: 'r1', activeHolds: 3 })).toBe('ACTIVE_RESERVATION_EXISTS');
  expect(run({ activeHolds: 3 })).toBe('HOLD_LIMIT_REACHED');
  expect(run({ activeHolds: 1, maxActiveHolds: 1 })).toBe('HOLD_LIMIT_REACHED');
});

test('risk restriction applies to early seats of HIGH tier members only', () => {
  expect(run({ riskTier: 'HIGH', seatNumber: 1 })).toBe('RISK_RESTRICTED');
  expect(run({ riskTier: 'HIGH', seatNumber: 5 })).toBeNull();
});

test('the limits chain re-validates inside the transaction', () => {
  const limits = buildLimitsChain();
  expect(codeOf(() => limits.handle({ activeHolds: 3, maxActiveHolds: 3, activeReservationInJameya: null }))).toBe('HOLD_LIMIT_REACHED');
  expect(codeOf(() => limits.handle({ activeHolds: 0, maxActiveHolds: 3, activeReservationInJameya: null }))).toBeNull();
});
