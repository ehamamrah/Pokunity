import { toEventDto, type AnalyticsEventDraft, type ExperimentAssignment } from './events';
import { EventBatcher, type BatcherOptions, type BatchSink } from './event-batcher';

export interface AnalyticsService {
  track(draft: AnalyticsEventDraft): void;
  rememberExperiment(experiment: ExperimentAssignment | null | undefined): void;
  flush(): Promise<void>;
  flushOnHide(): void;
  pending(): number;
  reset(): void;
}

/** Remembers the most recent list assignment so detail and checkout events share its variant. */
function createAttribution() {
  let last: ExperimentAssignment | null = null;
  return {
    current: (): ExperimentAssignment | null => last,
    remember(experiment: ExperimentAssignment | null | undefined): void {
      if (experiment) last = experiment;
    },
  };
}

type Attribution = ReturnType<typeof createAttribution>;

function toService(batcher: EventBatcher, attribution: Attribution, clock: () => number): AnalyticsService {
  return {
    track: (draft) => {
      batcher.enqueue(toEventDto({ ...draft, experiment: draft.experiment ?? attribution.current() }, clock()));
    },
    rememberExperiment: (experiment) => attribution.remember(experiment),
    flush: () => batcher.flush(),
    flushOnHide: () => batcher.flushOnHide(),
    pending: () => batcher.pending(),
    reset: () => batcher.clear(),
  };
}

/** Composes batching with experiment attribution (see docs/frontend/architecture.md). */
export function createAnalyticsService(sink: BatchSink, options: BatcherOptions, clock: () => number = Date.now): AnalyticsService {
  return toService(new EventBatcher(sink, options), createAttribution(), clock);
}
