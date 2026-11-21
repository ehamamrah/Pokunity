import { errorEnvelopeSchema } from '../contract/schemas';
import { ApiError, type ApiErrorCode, isApiErrorCode } from './errors';

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'Some of the details are not valid. Please check and try again.',
  UNAUTHORIZED: 'Your session has ended. Please sign in again.',
  INVALID_CREDENTIALS: 'The email or password is incorrect.',
  INVALID_SIGNATURE: 'The request signature is invalid.',
  KYC_REQUIRED: 'Identity verification is required before you can reserve a seat.',
  RISK_RESTRICTED: 'This seat is not available for your account.',
  FORBIDDEN: 'You do not have access to this resource.',
  NOT_FOUND: 'We could not find that item.',
  SEAT_UNAVAILABLE: 'That seat is no longer available.',
  JAMEYA_FULL: 'This Jameya is full.',
  ACTIVE_RESERVATION_EXISTS: 'You already have an active hold in this Jameya.',
  HOLD_LIMIT_REACHED: 'You have reached the maximum number of active holds.',
  INVALID_STATE: 'This action is not available for the current status.',
  IDEMPOTENCY_IN_PROGRESS: 'Your previous request is still being processed.',
  RESERVATION_EXPIRED: 'Your hold has expired.',
  IDEMPOTENCY_KEY_REUSED: 'This request conflicts with an earlier one. Please start again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  KYC_UNAVAILABLE: 'Identity verification is temporarily unavailable.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  SERVICE_UNAVAILABLE: 'Pokunity is temporarily unavailable. Please try again shortly.',
  UPSTREAM_TIMEOUT: 'That took too long. Please try again.',
};

/** Retry-After may be delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, nowMs: number = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - nowMs) / 1000));
}

function codeFromStatus(status: number): ApiErrorCode {
  const byStatus: Record<number, ApiErrorCode> = {
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    429: 'RATE_LIMITED',
    503: 'SERVICE_UNAVAILABLE',
    504: 'UPSTREAM_TIMEOUT',
  };
  return byStatus[status] ?? 'INTERNAL_ERROR';
}

/** Converts any non-2xx response into a typed ApiError, tolerating non-contract bodies. */
export function toApiError(status: number, body: unknown, headers: Headers): ApiError {
  const parsed = errorEnvelopeSchema.safeParse(body);
  const envelope = parsed.success ? parsed.data.error : null;
  const code = envelope && isApiErrorCode(envelope.code) ? envelope.code : codeFromStatus(status);
  return new ApiError({
    status,
    code,
    message: envelope?.message ?? DEFAULT_MESSAGES[code],
    details: envelope?.details ?? null,
    traceId: envelope?.traceId ?? headers.get('x-request-id'),
    retryAfterSeconds: parseRetryAfter(headers.get('retry-after')),
  });
}
