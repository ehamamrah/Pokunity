import { Injectable, Logger } from '@nestjs/common';
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
@Injectable()
export class AvailabilityGateService {
  private readonly logger = new Logger(AvailabilityGateService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly seats: SeatsRepository,
  ) {}

  async admit(jameyaId: string, seatNumber: number): Promise<GateDecision> {
    try {
      if ((await this.availableCount(jameyaId)) <= 0) return { admitted: false, reason: 'FULL' };
      return await this.lockSeat(jameyaId, seatNumber);
    } catch (error) {
      this.logger.warn({ msg: 'gate unavailable, admitting', jameyaId, error: String(error) });
      return { admitted: true, release: async () => undefined };
    }
  }

  /** Counter adjustments after committed DB changes; best effort (periodic rebuild corrects drift). */
  async adjust(jameyaId: string, delta: number): Promise<void> {
    await this.redis.client.eval(ADJUST_IF_EXISTS, 1, counterKey(jameyaId), delta).catch(() => null);
  }

  /** Re-derives every tracked counter from PostgreSQL (source of truth). */
  async rebuild(): Promise<number> {
    const ids = await this.redis.client.smembers(TRACKED);
    if (ids.length === 0) return 0;
    const counts = await this.seats.availableCounts(ids);
    const pipeline = this.redis.client.pipeline();
    ids.forEach((id) => pipeline.set(counterKey(id), counts.get(id) ?? 0, 'EX', COUNTER_TTL_S));
    await pipeline.exec();
    return ids.length;
  }

  private async availableCount(jameyaId: string): Promise<number> {
    const cached = await this.redis.client.get(counterKey(jameyaId));
    if (cached !== null) return Number(cached);
    const count = (await this.seats.availableCounts([jameyaId])).get(jameyaId) ?? 0;
    await this.redis.client.multi().set(counterKey(jameyaId), count, 'EX', COUNTER_TTL_S, 'NX').sadd(TRACKED, jameyaId).exec();
    return count;
  }

  private async lockSeat(jameyaId: string, seatNumber: number): Promise<GateDecision> {
    const token = randomUUID();
    const key = seatKey(jameyaId, seatNumber);
    const ok = await this.redis.client.set(key, token, 'PX', SEAT_LOCK_MS, 'NX');
    if (ok !== 'OK') return { admitted: false, reason: 'SEAT_BUSY' };
    const release = async () => {
      await this.redis.client.eval(DELETE_IF_OWNER, 1, key, token).catch(() => null);
    };
    return { admitted: true, release };
  }
}
