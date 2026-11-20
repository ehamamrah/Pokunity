import { Injectable } from '@nestjs/common';
import { decideExisting, IdempotencyBegin } from './domain/idempotency-record';
import { IdempotencyRepository } from './infrastructure/idempotency.repository';

/** Application service implementing the contract's idempotency semantics (per user, 24h). */
@Injectable()
export class IdempotencyService {
  constructor(private readonly repository: IdempotencyRepository) {}

  async begin(userId: string, key: string, requestHash: string): Promise<IdempotencyBegin> {
    if (await this.repository.claim(userId, key, requestHash)) return { kind: 'proceed' };
    const existing = await this.repository.find(userId, key);
    if (!existing) return this.begin(userId, key, requestHash);
    const decision = decideExisting(existing, requestHash);
    if (decision.kind !== 'proceed') return decision;
    return (await this.repository.takeOver(userId, key)) ? decision : { kind: 'in_progress' };
  }

  complete(userId: string, key: string, status: number, body: unknown): Promise<void> {
    return this.repository.complete(userId, key, status, body);
  }

  release(userId: string, key: string): Promise<void> {
    return this.repository.release(userId, key);
  }
}
