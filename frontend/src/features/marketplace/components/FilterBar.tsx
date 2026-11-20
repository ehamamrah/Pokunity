'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui';
import { parseSarInput, toSarInputValue } from '@/shared/lib/money';
import { useDebouncedValue } from '@/shared/lib/use-debounced-value';
import { DEFAULT_FILTERS, DURATION_OPTIONS, countActiveFilters, isAmountRangeValid, type MarketplaceFilters } from '../model/filters';
import { SortSelect } from './SortSelect';

/** Typing settles for this long before the search is sent (one request per pause, not per key). */
export const SEARCH_DEBOUNCE_MS = 300;

export interface Draft {
  q: string;
  minSar: string;
  maxSar: string;
  duration: string;
}

function toDraft(filters: MarketplaceFilters): Draft {
  return {
    q: filters.q,
    minSar: toSarInputValue(filters.minMonthly),
    maxSar: toSarInputValue(filters.maxMonthly),
    duration: filters.duration === null ? '' : String(filters.duration),
  };
}

function fromDraft(draft: Draft, current: MarketplaceFilters): MarketplaceFilters {
  return {
    ...current,
    q: draft.q,
    minMonthly: parseSarInput(draft.minSar),
    maxMonthly: parseSarInput(draft.maxSar),
    duration: draft.duration ? Number(draft.duration) : null,
  };
}

/** Records the search this component last sent, so a URL echo of it does not overwrite newer typing. */
function useApplyHandler(filters: MarketplaceFilters, onApply: (next: MarketplaceFilters) => void) {
  const appliedQ = useRef(filters.q);
  const apply = useCallback((next: MarketplaceFilters) => {
    appliedQ.current = next.q;
    onApply(next);
  }, [onApply]);
  return { appliedQ, apply };
}

function useResyncDraft(filters: MarketplaceFilters, appliedQ: { current: string }, setDraft: (update: (previous: Draft) => Draft) => void) {
  useEffect(() => {
    setDraft((previous) => ({ ...toDraft(filters), q: filters.q === appliedQ.current ? previous.q : filters.q }));
  }, [filters, appliedQ, setDraft]);
}

/** Sends the search once typing pauses. Reads the latest filters through a ref, so it fires only on the debounced value. */
function useDebouncedSearch(q: string, latest: { current: { filters: MarketplaceFilters; onApply: (next: MarketplaceFilters) => void } }, appliedQ: { current: string }) {
  const debouncedQ = useDebouncedValue(q, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    const current = latest.current;
    if (debouncedQ === current.filters.q) return;
    appliedQ.current = debouncedQ;
    current.onApply({ ...current.filters, q: debouncedQ });
  }, [debouncedQ, latest, appliedQ]);
}

/** Hook: draft state, the apply path, and the submit handler for the filter form. */
function useFilterDraft(filters: MarketplaceFilters, onApply: (next: MarketplaceFilters) => void) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(filters));
  const { appliedQ, apply } = useApplyHandler(filters, onApply);
  const latest = useRef({ filters, onApply });
  latest.current = { filters, onApply };
  useResyncDraft(filters, appliedQ, setDraft);
  useDebouncedSearch(draft.q, latest, appliedQ);
  const valid = isAmountRangeValid(parseSarInput(draft.minSar), parseSarInput(draft.maxSar));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (valid) apply(fromDraft(draft, filters));
  };
  return { draft, setDraft, valid, submit, apply };
}

function SearchField({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="jameya-search" className="text-sm font-medium text-slate-700">Search by name</label>
      <input id="jameya-search" type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="e.g. Riyadh" className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" />
    </div>
  );
}

function AmountInput({ id, label, placeholder, value, invalid, onChange }: { id: string; label: string; placeholder: string; value: string; invalid: boolean; onChange: (value: string) => void }) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <input id={id} inputMode="numeric" placeholder={placeholder} value={value} aria-invalid={invalid} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
    </>
  );
}

function AmountFields({ min, max, valid, onChange }: { min: string; max: string; valid: boolean; onChange: (patch: Partial<Pick<Draft, 'minSar' | 'maxSar'>>) => void }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium text-slate-700">Monthly amount (SAR)</legend>
      <div className="flex items-center gap-2">
        <AmountInput id="min-monthly" label="Minimum monthly amount in SAR" placeholder="Min" value={min} invalid={!valid} onChange={(minSar) => onChange({ minSar })} />
        <span aria-hidden="true" className="text-slate-400">to</span>
        <AmountInput id="max-monthly" label="Maximum monthly amount in SAR" placeholder="Max" value={max} invalid={!valid} onChange={(maxSar) => onChange({ maxSar })} />
      </div>
    </fieldset>
  );
}

function DurationField({ value, onChange }: { value: string; onChange: (duration: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="duration" className="text-sm font-medium text-slate-700">Duration</label>
      <select id="duration" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
        <option value="">Any length</option>
        {DURATION_OPTIONS.map((months) => <option key={months} value={months}>{months} months</option>)}
      </select>
    </div>
  );
}

function AvailabilityToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700 sm:self-end">
      <input type="checkbox" className="size-4 accent-teal-700" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      Only show Jameyas with seats left
    </label>
  );
}

function FilterActions({ filters, valid, onClear }: { filters: MarketplaceFilters; valid: boolean; onClear: () => void }) {
  return (
    <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
      <Button type="submit" disabled={!valid}>Apply filters</Button>
      <Button variant="ghost" onClick={onClear}>Clear ({countActiveFilters(filters)})</Button>
      {valid ? null : <p className="text-sm text-rose-700">Minimum must be lower than maximum.</p>}
    </div>
  );
}

interface FilterBarProps {
  filters: MarketplaceFilters;
  onApply: (next: MarketplaceFilters) => void;
}

/** Search is debounced; amounts and duration apply on submit or at once for selects. Every change lands in the URL. */
export function FilterBar({ filters, onApply }: FilterBarProps) {
  const { draft, setDraft, valid, submit, apply } = useFilterDraft(filters, onApply);
  return (
    <form role="search" aria-label="Filter Jameyas" onSubmit={submit} className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-4">
      <SearchField value={draft.q} onChange={(q) => setDraft({ ...draft, q })} />
      <AmountFields min={draft.minSar} max={draft.maxSar} valid={valid} onChange={(patch) => setDraft({ ...draft, ...patch })} />
      <DurationField value={draft.duration} onChange={(duration) => apply({ ...filters, duration: duration ? Number(duration) : null })} />
      <SortSelect value={filters.sort} onChange={(sort) => apply({ ...filters, sort })} />
      <AvailabilityToggle checked={filters.availableOnly} onChange={(availableOnly) => apply({ ...filters, availableOnly })} />
      <FilterActions filters={filters} valid={valid} onClear={() => apply({ ...DEFAULT_FILTERS, sort: filters.sort })} />
    </form>
  );
}
