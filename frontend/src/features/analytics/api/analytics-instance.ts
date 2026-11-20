import { apiClient } from '@/shared/api-client';
import { API_BASE_URL } from '@/shared/config/env';
import { TIMING } from '@/shared/config/timing';
import { acceptedEventsSchema } from '@/shared/contract';
import type { AnalyticsEventDto } from '../model/events';
import type { BatchSink } from '../model/event-batcher';
import { createAnalyticsService } from '../model/analytics-service';

/** Sink that uses fetch with keepalive normally, and sendBeacon when the page is hidden. */
const browserSink: BatchSink = {
  async send(events: AnalyticsEventDto[], keepalive: boolean) {
    await apiClient.post('/events', acceptedEventsSchema, { body: { events }, keepalive });
  },
  beacon(events: AnalyticsEventDto[]) {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
    const body = new Blob([JSON.stringify({ events })], { type: 'application/json' });
    return navigator.sendBeacon(`${API_BASE_URL}/events`, body);
  },
};

export const analytics = createAnalyticsService(browserSink, {
  maxBatch: TIMING.analyticsMaxBatch,
  intervalMs: TIMING.analyticsFlushMs,
  hardMax: TIMING.analyticsHardMax,
  maxQueue: TIMING.analyticsMaxQueue,
});
