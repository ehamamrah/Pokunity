import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Response } from 'express';
import { RequestContextStore } from '../logging/request-context';
import { AppError } from './app-error';
import { ErrorCode } from './error-codes';

const codeByHttpStatus: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  413: ErrorCode.VALIDATION_ERROR,
  429: ErrorCode.RATE_LIMITED,
};

/** Converts every thrown error into the contract error envelope, always with a traceId. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const error = this.toAppError(exception);
    const traceId = traceIdOf(res);
    Object.entries(error.headers).forEach(([k, v]) => res.setHeader(k, v));
    const { code, message, details } = error;
    res.status(error.httpStatus).json({ error: { code, message, details, traceId } });
  }

  private toAppError(exception: unknown): AppError {
    if (exception instanceof AppError) return exception;
    if (exception instanceof HttpException) return this.fromHttpException(exception);
    const err = exception as Error;
    this.logger.error({ msg: 'unhandled error', error: err?.message, stack: err?.stack });
    return new AppError(ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred.');
  }

  private fromHttpException(exception: HttpException): AppError {
    const status = exception.getStatus();
    const code = codeByHttpStatus[status] ?? ErrorCode.INTERNAL_ERROR;
    if (code === ErrorCode.INTERNAL_ERROR) this.logger.error({ msg: exception.message, status });
    const message = code === ErrorCode.VALIDATION_ERROR ? 'Malformed request.' : exception.message;
    return new AppError(code, message);
  }
}

/**
 * Never empty: the request context, else the X-Request-Id already sent (errors raised outside the
 * async context, e.g. by the JSON body parser), else a fresh id that is also returned as the header.
 */
function traceIdOf(res: Response): string {
  const id = RequestContextStore.requestId() ?? (res.getHeader('X-Request-Id') as string | undefined) ?? randomUUID();
  if (!res.headersSent) res.setHeader('X-Request-Id', id);
  return id;
}
