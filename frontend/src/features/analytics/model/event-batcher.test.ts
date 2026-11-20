import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAnalyticsService, type AnalyticsService } from './analytics-service';
import type { AnalyticsEventDto } from './events';
import type { BatchSink } from './event-batcher';

const OPTIONS = { maxBatch: 20, intervalMs: 5_000, hardMax: 50, maxQueue: 200 };

function makeSink() {
  const send = vi.fn((_events: AnalyticsEventDto[], _keepalive: boolean) => Promise.resolve());
  const beacon = vi.fn((_events: AnalyticsEventDto[]) => true);
  return { sink: { send, beacon } satisfies BatchSink, send, beacon };
}

function serviceWith(sink: BatchSink): AnalyticsService {
  return createAnalyticsService(sink, OPTIONS, () => 0);
}

function draft(jameyaId = 'j-1') {
  return { type: 'impression' as const, jameyaId, surface: 'marketplace_list' as const, position: 1 };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('flushes immediately once twenty events are queued', () => {
  const { sink, send } = makeSink();
  const service = serviceWith(sink);
  for (let index = 0; index < 20; index += 1) service.track(draft(`j-${index}`));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toHaveLength(20);
});

it('flushes a partial batch after the five second interval', async () => {
  const { sink, send } = makeSink();
  serviceWith(sink).track(draft());
  expect(send).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5_000);
  await vi.runOnlyPendingTimersAsync();
  expect(send).toHaveBeenCalledTimes(1);
});

it('uses the beacon path when the page is hidden, so nothing is lost on unload', () => {
  const { sink, beacon } = makeSink();
  const service = serviceWith(sink);
  service.track(draft());
  service.flushOnHide();
  expect(beacon).toHaveBeenCalledTimes(1);
  expect(service.pending()).toBe(0);
});

it('keeps events queued after a failed send and retries them', async () => {
  const send = vi.fn((_events: AnalyticsEventDto[], _keepalive: boolean): Promise<void> => Promise.reject(new Error('offline')));
  send.mockImplementationOnce(() => Promise.reject(new Error('offline')));
  send.mockImplementation(() => Promise.resolve());
  const service = serviceWith({ send, beacon: () => true });
  service.track(draft());
  await service.flush();
  expect(service.pending()).toBe(1);
  await service.flush();
  expect(service.pending()).toBe(0);
});

it('attributes events to the experiment remembered from the list', () => {
  const { sink, beacon } = makeSink();
  const service = serviceWith(sink);
  service.rememberExperiment({ key: 'ranking_v2', variant: 'treatment' });
  service.track({ type: 'click', jameyaId: 'j-1', surface: 'jameya_detail', position: null });
  service.flushOnHide();
  expect(beacon).toHaveBeenCalledWith([expect.objectContaining({ experiment: { key: 'ranking_v2', variant: 'treatment' } })]);
});

it('drops the queue after repeated failed sends, so memory stays bounded during an outage', async () => {
  const send = vi.fn((_events: AnalyticsEventDto[], _keepalive: boolean): Promise<void> => Promise.reject(new Error('down')));
  const service = serviceWith({ send, beacon: () => true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    service.track(draft());
    await service.flush();
  }
  expect(service.pending()).toBe(0);
});
