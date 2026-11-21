import { isApiError, isNetworkError, readDetail, type ApiError, type ApiErrorCode } from '@/shared/api-client';

export type RecoveryAction =
  | { kind: 'none' }
  | { kind: 'refresh' }
  | { kind: 'retry' }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'wait'; seconds: number };

export interface ErrorPresentation {
  title: string;
  message: string;
  action: RecoveryAction;
  /** Trace id for support, shown in small print. */
  reference: string | null;
  /** JAMEYA_FULL: the UI should show similar Jameyas inline. */
  showSimilar: boolean;
}

/** Context the caller knows that the error alone does not carry. */
export interface ErrorContext {
  /** Nearest seats that are still open, computed from the current seat map. */
  suggestedSeats?: readonly number[];
  /** Marketplace link with similar amounts for JAMEYA_FULL. */
  similarHref?: string;
  /** The Jameya detail page, to resume choosing a seat. */
  jameyaHref?: string;
}

type Copy = Omit<ErrorPresentation, 'reference' | 'showSimilar'>;
type Strategy = (error: ApiError, context: ErrorContext) => Copy;

const MY_RESERVATIONS: RecoveryAction = { kind: 'link', href: '/reservations', label: 'View my reservations' };

function formatDetail(value: unknown): string {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : 'you selected';
}

/** v1.1: the error carries the limit and the count, so the message can state both. */
function holdLimitText(error: ApiError): string {
  const max = readDetail(error, 'maxActiveHolds');
  const active = readDetail(error, 'activeHolds');
  if (typeof max === 'number' && typeof active === 'number') {
    return `You hold ${active} of your ${max} seats. Release one, or complete a payment, to hold another.`;
  }
  return 'You have the maximum number of seats on hold. Release one, or complete a payment, to hold another.';
}

function suggestionText(context: ErrorContext): string {
  const seats = context.suggestedSeats ?? [];
  return seats.length > 0 ? ` Nearest open seats: ${seats.join(', ')}.` : '';
}

/**
 * Strategy table: one entry per contract error code. The exhaustive record means adding a
 * code to the contract is a compile error here until its user-facing copy exists.
 */
const STRATEGIES: Record<ApiErrorCode, Strategy> = {
  SEAT_UNAVAILABLE: (error, context) => ({
    title: 'That seat was just taken',
    message: `Seat ${formatDetail(readDetail(error, 'seatNumber'))} is no longer available. The seat map has been refreshed.${suggestionText(context)}`,
    action: { kind: 'refresh' },
  }),
  JAMEYA_FULL: () => ({
    title: 'This Jameya is full',
    message: 'Every seat has been taken. Similar Jameyas below may still have room.',
    action: { kind: 'none' },
  }),
  KYC_REQUIRED: () => ({
    title: 'Verify your identity to reserve',
    message: 'Your account must be verified before you can hold a seat. You can keep browsing in the meantime.',
    action: { kind: 'none' },
  }),
  KYC_UNAVAILABLE: () => ({
    title: 'Verification is temporarily unavailable',
    message: 'We cannot check your verification status right now. Browsing still works. Please try again shortly.',
    action: { kind: 'retry' },
  }),
  RISK_RESTRICTED: () => ({
    title: 'Not available for your account',
    message: 'This seat is restricted for your risk profile. Choose another seat.',
    action: { kind: 'refresh' },
  }),
  HOLD_LIMIT_REACHED: (error) => ({
    title: 'Hold limit reached',
    message: holdLimitText(error),
    action: MY_RESERVATIONS,
  }),
  ACTIVE_RESERVATION_EXISTS: (error) => {
    const reservationId = readDetail(error, 'reservationId');
    const href = typeof reservationId === 'string' ? `/reservations/${reservationId}` : '/reservations';
    return {
      title: 'You already hold a seat here',
      message: 'You can hold one seat per Jameya at a time.',
      action: { kind: 'link', href, label: 'View your hold' },
    };
  },
  RATE_LIMITED: (error) => ({
    title: 'Too many attempts',
    message: 'Please wait a moment before trying again.',
    action: { kind: 'wait', seconds: error.retryAfterSeconds ?? 5 },
  }),
  IDEMPOTENCY_IN_PROGRESS: () => ({
    title: 'Still processing',
    message: 'Your previous request is still being processed. We will check again automatically.',
    action: { kind: 'retry' },
  }),
  INVALID_STATE: () => ({
    title: 'This reservation has moved on',
    message: 'Its status changed, so the action is no longer possible. We refreshed the details.',
    action: { kind: 'refresh' },
  }),
  RESERVATION_EXPIRED: (_error, context) => ({
    title: 'Your hold expired',
    message: 'Holds last a few minutes. Pick a seat again to continue. You were not charged.',
    action: context.jameyaHref ? { kind: 'link', href: context.jameyaHref, label: 'Choose a seat again' } : MY_RESERVATIONS,
  }),
  UNAUTHORIZED: () => ({
    title: 'Please sign in again',
    message: 'Your session has ended.',
    action: { kind: 'none' },
  }),
  INVALID_CREDENTIALS: () => ({ title: 'Sign-in failed', message: 'The email or password is incorrect.', action: { kind: 'none' } }),
  INVALID_SIGNATURE: () => ({ title: 'Request rejected', message: 'The request could not be verified.', action: { kind: 'none' } }),
  FORBIDDEN: () => ({ title: 'Not your reservation', message: 'This reservation belongs to another account.', action: MY_RESERVATIONS }),
  NOT_FOUND: () => ({ title: 'Not found', message: 'This item no longer exists.', action: MY_RESERVATIONS }),
  VALIDATION_ERROR: () => ({ title: 'Check your request', message: 'Some details are not valid. Start again from the seat map.', action: { kind: 'refresh' } }),
  IDEMPOTENCY_KEY_REUSED: () => ({ title: 'Please start again', message: 'This request conflicts with an earlier attempt. Start again from the seat map.', action: { kind: 'refresh' } }),
  SERVICE_UNAVAILABLE: (error) => ({
    title: 'Pokunity is temporarily unavailable',
    message: error.retryAfterSeconds ? `We are recovering. Try again in about ${error.retryAfterSeconds} seconds. No charge was made.` : 'We are recovering. Try again shortly. No charge was made.',
    action: { kind: 'retry' },
  }),
  UPSTREAM_TIMEOUT: () => ({
    title: 'That took too long',
    message: 'The server did not answer in time. Your request is safe to retry, and no charge was made.',
    action: { kind: 'retry' },
  }),
  INTERNAL_ERROR: () => ({ title: 'Something went wrong', message: 'This is on our side. Please try again in a moment. No charge was made.', action: { kind: 'retry' } }),
};

function networkPresentation(): Copy {
  return {
    title: 'Connection problem',
    message: 'We could not reach Pokunity. Check your connection and try again.',
    action: { kind: 'retry' },
  };
}

/** Maps any failure to user-facing copy. Raw server messages are never shown verbatim. */
export function describeReservationError(error: unknown, context: ErrorContext = {}): ErrorPresentation {
  if (isNetworkError(error)) return { ...networkPresentation(), reference: null, showSimilar: false };
  if (!isApiError(error)) {
    return { title: 'Something went wrong', message: 'Please try again.', action: { kind: 'retry' }, reference: null, showSimilar: false };
  }
  const copy = STRATEGIES[error.code](error, context);
  return { ...copy, reference: error.traceId, showSimilar: error.code === 'JAMEYA_FULL' };
}
