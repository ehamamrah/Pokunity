export type AnalyticsEventType = 'impression' | 'click' | 'seat_selected' | 'checkout_started';
export type AnalyticsSurface = 'marketplace_list' | 'featured_carousel' | 'jameya_detail' | 'checkout';

export interface ExperimentAssignment {
  key: string;
  variant: 'control' | 'treatment';
}

/** What the UI knows at the moment of the interaction. */
export interface AnalyticsEventDraft {
  type: AnalyticsEventType;
  jameyaId: string;
  surface: AnalyticsSurface;
  /** 1-based rank in the list; null for detail pages. */
  position?: number | null;
  experiment?: ExperimentAssignment | null;
}

/** Wire shape of one element of POST /api/v1/events (docs/api/openapi.yaml AnalyticsEvent). */
export interface AnalyticsEventDto {
  type: AnalyticsEventType;
  jameyaId: string;
  surface: AnalyticsSurface;
  position: number | null;
  experiment?: ExperimentAssignment;
  occurredAt: string;
}

export function toEventDto(draft: AnalyticsEventDraft, nowMs: number): AnalyticsEventDto {
  const dto: AnalyticsEventDto = {
    type: draft.type,
    jameyaId: draft.jameyaId,
    surface: draft.surface,
    position: draft.position ?? null,
    occurredAt: new Date(nowMs).toISOString(),
  };
  if (draft.experiment) dto.experiment = draft.experiment;
  return dto;
}
