import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Database } from '../../../shared/database/database.service';
import { AnalyticsEventRecord } from '../domain/analytics-event';
import { AnalyticsRepository } from './analytics.repository';

export const FLUSH_INTERVAL_MS = 250;
export const FLUSH_BATCH = 500;
export const MAX_BUFFERED = 20_000;

/**
 * Write-behind buffer for analytics: requests only append to memory; a timer (every 250 ms) or a
 * full batch (500) flushes with ONE multi-row insert. Trade-off: up to 250 ms of events can be lost
 * on a hard crash (graceful shutdown flushes). Above 20k buffered events (DB outage) the oldest are
 * dropped and logged: analytics must never take the booking path down with it.
 */
@Injectable()
export class BufferedEventWriter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BufferedEventWriter.name);
  private buffer: AnalyticsEventRecord[] = [];
  private flushing: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Database,
    private readonly repository: AnalyticsRepository,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  enqueue(records: AnalyticsEventRecord[]): number {
    this.buffer.push(...records);
    const overflow = this.buffer.length - MAX_BUFFERED;
    if (overflow > 0) {
      this.buffer.splice(0, overflow);
      this.logger.warn({ msg: 'analytics buffer full, dropped oldest events', dropped: overflow });
    }
    if (this.buffer.length >= FLUSH_BATCH) void this.flush();
    return records.length;
  }

  flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return this.flushing ?? Promise.resolve();
    const batch = this.buffer.splice(0, 5 * FLUSH_BATCH);
    this.flushing = this.repository.insertMany(this.db, batch)
      .then(() => undefined, (error: Error) => this.onFailure(batch, error))
      .finally(() => (this.flushing = null));
    return this.flushing;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    while (this.buffer.length > 0 || this.flushing) await this.flush();
  }

  /** Re-queue once (bounded by MAX_BUFFERED); a persistent DB outage ends in drops, never in OOM. */
  private onFailure(batch: AnalyticsEventRecord[], error: Error): void {
    this.logger.warn({ msg: 'analytics flush failed, re-queued', size: batch.length, error: error.message });
    this.buffer.unshift(...batch.slice(0, Math.max(0, MAX_BUFFERED - this.buffer.length)));
  }
}
