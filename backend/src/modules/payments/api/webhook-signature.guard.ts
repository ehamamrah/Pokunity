import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppConfig } from '../../../shared/config/app-config';
import { AppError } from '../../../shared/errors/app-error';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { isValidSignature } from '../domain/webhook-signature';

/** Rejects any provider callback whose HMAC-SHA256 of the raw body does not match (401). */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const raw = req.rawBody ?? Buffer.alloc(0);
    if (isValidSignature(raw, req.header('x-pokunity-signature'), this.config.env.PAYMENT_WEBHOOK_SECRET)) return true;
    throw new AppError(ErrorCode.INVALID_SIGNATURE, 'Webhook signature is missing or invalid.');
  }
}
