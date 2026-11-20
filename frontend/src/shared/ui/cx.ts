export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-300',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200',
  brand: 'bg-teal-50 text-teal-900 ring-teal-200',
};
