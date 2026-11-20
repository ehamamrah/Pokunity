const MS_PER_SECOND = 1_000;
const MS_PER_DAY = 86_400_000;

const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Whole seconds elapsed since an ISO timestamp, never negative (clock skew safe). */
export function secondsSince(isoTimestamp: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(isoTimestamp)) / MS_PER_SECOND));
}

export function formatAgo(seconds: number): string {
  if (seconds < 1) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function remainingMs(isoTimestamp: string, nowMs: number): number {
  return Math.max(0, Date.parse(isoTimestamp) - nowMs);
}

/** 299_400 ms -> "04:59" (ceil, so the display never reads 00:00 while time remains). */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** "2026-12-01" -> "1 Dec 2026" (UTC so the date never shifts with the viewer's zone). */
export function formatStartDate(isoDate: string): string {
  return DAY_MONTH_YEAR.format(new Date(`${isoDate}T00:00:00Z`));
}

/** "2027-06" -> "Jun 2027" */
export function formatPayoutMonth(yearMonth: string): string {
  return MONTH_YEAR.format(new Date(`${yearMonth}-01T00:00:00Z`));
}

export function daysUntil(isoDate: string, nowMs: number): number {
  return Math.ceil((Date.parse(`${isoDate}T00:00:00Z`) - nowMs) / MS_PER_DAY);
}
