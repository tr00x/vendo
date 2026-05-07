'use client';

import { SearchIcon, XIcon } from '@/components/ui/icons';

const TABS = [
  { value: 'all',        label: 'All',        hint: 'Show every referral.' },
  { value: 'active',     label: 'Pending',    hint: 'Patients waiting for an appointment.' },
  { value: 'scheduled',  label: 'Scheduled',  hint: 'Patients with a booked appointment.' },
  { value: 'completed',  label: 'Completed',  hint: 'Imaging studies that are finished.' },
] as const;

const MODALITIES = [
  { value: 'all',  label: 'All studies' },
  { value: 'MRI',  label: 'MRI — Magnetic Resonance' },
  { value: 'XRAY', label: 'X-Ray — Plain film' },
  { value: 'ARK',  label: 'Ultrasound' },
] as const;

export function Filters({
  query,
  status,
  modality,
  onQuery,
  onStatus,
  onModality,
  count,
}: {
  query: string;
  status: string;
  modality: string;
  onQuery: (v: string) => void;
  onStatus: (v: string) => void;
  onModality: (v: string) => void;
  count: number;
}) {
  return (
    <div className="mb-4 rounded-md border border-hairline bg-paper">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ash" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search by patient name, study type, or reason…"
            className="w-full rounded-md border border-hairline bg-bone py-2 pl-9 pr-9 text-[14px] text-ink placeholder:text-ash focus:border-ink/30 focus:bg-paper focus:outline-none focus:ring-2 focus:ring-ink/5"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-smoke hover:bg-hairline hover:text-ink"
              aria-label="Clear search"
              title="Clear search"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={modality}
            onChange={(e) => onModality(e.target.value)}
            title="Filter by study type"
            className="appearance-none rounded-md border border-hairline bg-paper px-3 py-2 pr-8 text-[13px] font-medium text-graphite transition focus:border-ink/30 focus:outline-none"
          >
            {MODALITIES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <svg viewBox="0 0 12 12" className="pointer-events-none absolute right-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-graphite" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 5 3 3 3-3" />
          </svg>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => {
            const active = status === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => onStatus(t.value)}
                title={t.hint}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                  active
                    ? 'bg-cta text-white'
                    : 'text-graphite hover:bg-hairline/60 hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="whitespace-nowrap text-[12px] text-smoke tabular">
          {count} {count === 1 ? 'result' : 'results'}
        </div>
      </div>
    </div>
  );
}
