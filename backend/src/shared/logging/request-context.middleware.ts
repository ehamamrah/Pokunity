import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { RequestContextStore } from './request-context';

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Assigns/propagates X-Request-Id and writes one structured access-log line per request. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('http');

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => this.logAccess(req, res, started, requestId));
    RequestContextStore.run({ requestId }, next);
  }

  private logAccess(req: Request, res: Response, started: bigint, requestId: string): void {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const path = req.originalUrl.split('?')[0];
    const entry = { msg: 'request', requestId, method: req.method, path, status: res.statusCode };
    this.logger.log({ ...entry, durationMs: Math.round(durationMs * 10) / 10 });
  }
}
