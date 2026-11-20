'use client';

import { useId } from 'react';
import { SORT_OPTIONS, sortOptionFor, type SortKey } from '../model/sort-options';

export function SortSelect({ value, onChange }: { value: SortKey; onChange: (sort: SortKey) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">Sort by</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as SortKey)} aria-describedby={`${id}-hint`} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
        {SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
      <p id={`${id}-hint`} className="text-xs text-slate-500">{sortOptionFor(value).hint}</p>
    </div>
  );
}
