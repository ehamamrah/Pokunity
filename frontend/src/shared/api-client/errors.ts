/** Every error code in the contract's error table (docs/api/README.md). */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'INVALID_SIGNATURE',
  'KYC_REQUIRED',
  'RISK_RESTRICTED',
  'FORBIDDEN',
  'NOT_FOUND',
  'SEAT_UNAVAILABLE',
  'JAMEYA_FULL',
  'ACTIVE_RESERVATION_EXISTS',
  'HOLD_LIMIT_REACHED',
  'INVALID_STATE',
  'IDEMPOTENCY_IN_PROGRESS',
  'RESERVATION_EXPIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'RATE_LIMITED',
  'KYC_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}

export interface ApiErrorInit {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown> | null;
  traceId?: string | null;
  retryAfterSeconds?: number | null;
}

/** A non-2xx response, typed by the contract error envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown> | null;
  readonly traceId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? null;
    this.traceId = init.traceId ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }
}

/** The request never produced an HTTP response (offline, DNS, reset). */
export class NetworkError extends Error {
  constructor(message = 'Network request failed') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** A 2xx body that does not match the contract schema. */
export class ContractError extends Error {
  readonly issues: string[];

  constructor(path: string, issues: string[]) {
    super(`Response from ${path} does not match the API contract`);
    this.name = 'ContractError';
    this.issues = issues;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function readDetail(error: ApiError, key: string): unknown {
  return error.details?.[key];
}
