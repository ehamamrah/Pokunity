import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../../../shared/redis/redis.service';
import { SeatsRepository } from '../infrastructure/seats.repository';

const counterKey = (jameyaId: string) => `gate:avail:${jameyaId}`;
const seatKey = (jameyaId: string, seat: number) => `gate:seat:${jameyaId}:${seat}`;
const TRACKED = 'gate:tracked';
const COUNTER_TTL_S = 120;
const SEAT_LOCK_MS = 3000;

const ADJUST_IF_EXISTS = `if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('INCRBY', KEYS[1], ARGV[1]) end return nil`;
const DELETE_IF_OWNER = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

export type GateDecision = { admitted: true; release: () => Promise<void> } | { admitted: false; reason: 'FULL' | 'SEAT_BUSY' };

/**
 * Fast-fail admission gate in front of the authoritative PostgreSQL seat claim.
 *  1. per-Jameya available-seat counter → rejects requests for full Jameyas without touching the DB;
 *  2. per-seat single-flight lock → at most one in-flight DB claim per seat; concurrent ones lose fast.
 * Never authoritative: on any Redis error it admits the request and the DB decides.
 */
const ADMIT_ANYWAY: GateDecision = { admitted: true, release: async () => undefined };

/**
 * Fast-fail admission gate in front of the authoritative PostgreSQL seat claim.
 *  1. per-Jameya available-seat counter → rejects requests for full Jameyas without touching the DB;
 *  2. per-seat single-flight lock → at most one in-flight DB claim per seat; concurrent ones lose fast.
 * Never authoritative: every Redis call goes through the Redis circuit breaker and, on any failure,
 * the request is admitted and PostgreSQL decides.
 */
@Injectable()
export class AvailabilityGateService {
  constructor(
    private readonly redis: RedisService,
    private readonly seats: SeatsRepository,
  ) {}

  async admit(jameyaId: string, seatNumber: number): Promise<GateDecision> {
    const available = await this.availableCount(jameyaId);
    if (available !== null && available <= 0) return { admitted: false, reason: 'FULL' };
    return this.lockSeat(jameyaId, seatNumber);
  }

  /** Counter adjustments after committed DB changes; best effort (periodic rebuild corrects drift). */
  async adjust(jameyaId: string, delta: number): Promise<void> {
    await this.redis.guard((r) => r.eval(ADJUST_IF_EXISTS, 1, counterKey(jameyaId), delta), () => null);
  }

  /** Re-derives every tracked counter from PostgreSQL (source of truth). */
  async rebuild(): Promise<number> {
    const ids = await this.redis.guard((r) => r.smembers(TRACKED), () => [] as string[]);
    if (ids.length === 0) return 0;
    const counts = await this.seats.availableCounts(ids);
    const pipeline = this.redis.client.pipeline();
    ids.forEach((id) => pipeline.set(counterKey(id), counts.get(id) ?? 0, 'EX', COUNTER_TTL_S));
    await this.redis.guard(() => pipeline.exec(), () => null);
    return ids.length;
  }

  /** null = unknown (Redis unavailable): the caller admits and lets PostgreSQL decide. */
  private async availableCount(jameyaId: string): Promise<number | null> {
    const cached = await this.redis.guard((r) => r.get(counterKey(jameyaId)), () => undefined);
    if (cached === undefined) return null;
    if (cached !== null) return Number(cached);
    const count = (await this.seats.availableCounts([jameyaId])).get(jameyaId) ?? 0;
    await this.redis.guard((r) => r.multi().set(counterKey(jameyaId), count, 'EX', COUNTER_TTL_S, 'NX').sadd(TRACKED, jameyaId).exec(), () => null);
    return count;
  }

  private async lockSeat(jameyaId: string, seatNumber: number): Promise<GateDecision> {
    const token = randomUUID();
    const key = seatKey(jameyaId, seatNumber);
    const ok = await this.redis.guard((r) => r.set(key, token, 'PX', SEAT_LOCK_MS, 'NX'), () => 'UNAVAILABLE' as const);
    if (ok === 'UNAVAILABLE') return ADMIT_ANYWAY;
    if (ok !== 'OK') return { admitted: false, reason: 'SEAT_BUSY' };
    const release = async () => {
      await this.redis.guard((r) => r.eval(DELETE_IF_OWNER, 1, key, token), () => null);
    };
    return { admitted: true, release };
  }
}
