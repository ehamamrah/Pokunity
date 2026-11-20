import type { AnalyticsEventDto } from './events';

/** Port: how a batch leaves the browser. Implemented with fetch(keepalive) or sendBeacon. */
export interface BatchSink {
  send(events: AnalyticsEventDto[], keepalive: boolean): Promise<void>;
  beacon(events: AnalyticsEventDto[]): boolean;
}

export interface BatcherOptions {
  /** Flush immediately once this many events are queued. */
  maxBatch: number;
  /** Otherwise flush after this many ms since the first queued event. */
  intervalMs: number;
  /** Contract limit per request. */
  hardMax: number;
  /** Bound on the retry queue so a long outage cannot grow memory without limit. */
  maxQueue: number;
}

type TimerHandle = ReturnType<typeof setTimeout>;

/** Batches analytics: size-based, time-based, and a beacon path for page hide. */
export class EventBatcher {
  private queue: AnalyticsEventDto[] = [];
  private timer: TimerHandle | null = null;

  constructor(
    private readonly sink: BatchSink,
    private readonly options: BatcherOptions,
  ) {}

  pending(): number {
    return this.queue.length;
  }

  enqueue(event: AnalyticsEventDto): void {
    this.queue.push(event);
    if (this.queue.length >= this.options.maxBatch) {
      void this.flush();
      return;
    }
    this.scheduleFlush();
  }

  async flush(): Promise<void> {
    this.clearTimer();
    const batch = this.take();
    if (batch.length === 0) return;
    try {
      await this.sink.send(batch, true);
    } catch {
      this.requeue(batch);
    }
    if (this.queue.length > 0) this.scheduleFlush();
  }

  /** Called on pagehide / hidden. Synchronous and fire-and-forget by design. */
  flushOnHide(): void {
    this.clearTimer();
    const batch = this.take();
    if (batch.length > 0) this.sink.beacon(batch);
  }

  private take(): AnalyticsEventDto[] {
    return this.queue.splice(0, this.options.hardMax);
  }

  private requeue(batch: AnalyticsEventDto[]): void {
    this.queue = [...batch, ...this.queue].slice(-this.options.maxQueue);
  }

  private scheduleFlush(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.intervalMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
