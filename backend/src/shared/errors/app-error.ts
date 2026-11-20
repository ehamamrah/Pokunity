import { ErrorCode, HttpStatusByCode } from './error-codes';

export type ErrorDetails = Record<string, unknown>;

/** A business/protocol error that maps 1:1 to the contract error envelope. */
export class AppError extends Error {
  readonly httpStatus: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetails | null = null,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.httpStatus = HttpStatusByCode[code];
  }
}

/** Factory helpers keep messages consistent across modules. */
export const Errors = {
  validation: (fields: ErrorDetails[]) =>
    new AppError(ErrorCode.VALIDATION_ERROR, 'Request validation failed.', { fields }),
  unauthorized: () => new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required.'),
  forbidden: () => new AppError(ErrorCode.FORBIDDEN, 'This resource belongs to another user.'),
  notFound: (entity: string) => new AppError(ErrorCode.NOT_FOUND, `${entity} not found.`),
  invalidState: (status: string) =>
    new AppError(ErrorCode.INVALID_STATE, `Operation not allowed in status ${status}.`, { status }),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(
      ErrorCode.RATE_LIMITED,
      'Too many requests. Please retry later.',
      { retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    ),
};
