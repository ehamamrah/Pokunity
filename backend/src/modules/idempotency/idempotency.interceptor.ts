import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { AppError, Errors } from '../../shared/errors/app-error';
import { ErrorCode } from '../../shared/errors/error-codes';
import { RequestContextStore } from '../../shared/logging/request-context';
import { fingerprint, isReplayableStatus, isValidIdempotencyKey } from './domain/request-fingerprint';
import { IdempotencyBegin } from './domain/idempotency-record';
import { IdempotencyService } from './idempotency.service';

type Req = Request & { user: { id: string } };
interface Scope { userId: string; key: string; res: Response }

/**
 * Applied with @UseInterceptors on mutating booking endpoints. Runs after auth + rate limit
 * (guards) and before validation/handler, matching the contract's check order.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly service: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Req>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.header('idempotency-key');
    if (!isValidIdempotencyKey(key)) return throwError(() => missingKeyError());
    const scope: Scope = { userId: req.user.id, key, res };
    const hash = fingerprint(req.method, req.originalUrl.split('?')[0], req.body);
    return from(this.service.begin(scope.userId, key, hash)).pipe(
      mergeMap((decision) => this.dispatch(decision, scope, next)),
    );
  }

  private dispatch(decision: IdempotencyBegin, scope: Scope, next: CallHandler): Observable<unknown> {
    if (decision.kind === 'mismatch') return throwError(() => reusedKeyError());
    if (decision.kind === 'in_progress') return throwError(() => inProgressError());
    if (decision.kind === 'replay') return of(this.replay(scope.res, decision.status, decision.body));
    return next.handle().pipe(
      mergeMap((body) => from(this.store(scope, scope.res.statusCode, body)).pipe(mergeMap(() => of(body)))),
      catchError((error: unknown) => from(this.settleError(scope, error)).pipe(mergeMap(() => throwError(() => error)))),
    );
  }

  private replay(res: Response, status: number, body: unknown): unknown {
    res.status(status);
    res.setHeader('Idempotent-Replayed', 'true');
    return body;
  }

  private store(scope: Scope, status: number, body: unknown): Promise<void> {
    return this.service.complete(scope.userId, scope.key, status, body);
  }

  /** Deterministic business errors are stored and replayed; transient errors free the key. */
  private async settleError(scope: Scope, error: unknown): Promise<void> {
    if (!(error instanceof AppError) || !isReplayableStatus(error.httpStatus)) {
      return this.service.release(scope.userId, scope.key);
    }
    const traceId = RequestContextStore.requestId();
    const envelope = { error: { code: error.code, message: error.message, details: error.details, traceId } };
    Object.entries(error.headers).forEach(([k, v]) => scope.res.setHeader(k, v));
    await this.service.complete(scope.userId, scope.key, error.httpStatus, envelope);
  }
}

function missingKeyError(): AppError {
  return Errors.validation([{ field: 'Idempotency-Key', issues: ['header must be a UUID v4'] }]);
}
function reusedKeyError(): AppError {
  return new AppError(ErrorCode.IDEMPOTENCY_KEY_REUSED, 'Idempotency-Key was already used with a different request.');
}
function inProgressError(): AppError {
  return new AppError(ErrorCode.IDEMPOTENCY_IN_PROGRESS, 'A request with this Idempotency-Key is still being processed.');
}
