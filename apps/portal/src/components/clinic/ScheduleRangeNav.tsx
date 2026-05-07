'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  /** Current range start, YYYY-MM-DD. */
  from: string;
  /** Current span. */
  days: 1 | 3 | 7 | 14;
  /** Today's YYYY-MM-DD — used to render the "Today" pill. */
  today: string;
}

const RANGES: Array<{ days: 1 | 3 | 7 | 14; label: string }> = [
  { days: 1, label: 'Day' },
  { days: 3, label: '3 days' },
  { days: 7, label: 'Week' },
  { days: 14, label: '2 weeks' },
];

function shift(yyyymmdd: string, deltaDays: number): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function rangeLabel(from: string, days: 1 | 3 | 7 | 14): string {
  const [y, m, d] = from.split('-').map(Number);
  const start = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days - 1);

  const fmt = (dt: Date, opts: Intl.DateTimeFormatOptions) =>
    dt.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

  if (days === 1) {
    return fmt(start, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  if (sameMonth) {
    return `${fmt(start, { month: 'short', day: 'numeric' })} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric' })}, ${end.getUTCFullYear()}`;
  }
  return `${fmt(start, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function ScheduleRangeNav({ from, days, today }: Props) {
  const pathname = usePathname();
  const prevFrom = shift(from, -days);
  const nextFrom = shift(from, days);

  const buildHref = (newFrom: string, newDays: 1 | 3 | 7 | 14) => {
    const sp = new URLSearchParams();
    if (newFrom !== today) sp.set('from', newFrom);
    if (newDays !== 7) sp.set('days', String(newDays));
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const isToday = from === today && days <= 7;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-paper px-3 py-2">
      {/* Date pager — arrows immediately around the active range label so the
          eye doesn't jump across the screen when stepping through days. */}
      <div className="flex items-center gap-1.5">
        <Link
          href={buildHref(prevFrom, days)}
          title="Previous range"
          className="rounded p-1.5 text-smoke transition hover:bg-hairline/60 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <div
          className="min-w-[180px] px-1 text-center text-[14px] font-semibold tracking-tightish text-ink tabular sm:min-w-[220px]"
          aria-live="polite"
        >
          {rangeLabel(from, days)}
        </div>
        <Link
          href={buildHref(nextFrom, days)}
          title="Next range"
          className="rounded p-1.5 text-smoke transition hover:bg-hairline/60 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Link>
        <Link
          href={buildHref(today, days)}
          title="Jump to today"
          className={`ml-2 rounded px-2.5 py-1 text-[12.5px] font-medium transition ${
            isToday
              ? 'bg-cta text-white'
              : 'text-graphite hover:bg-hairline/60 hover:text-ink'
          }`}
        >
          Today
        </Link>
      </div>

      <div className="inline-flex overflow-hidden rounded-md border border-hairline" title="Range span">
        {RANGES.map((r) => {
          const active = r.days === days;
          return (
            <Link
              key={r.days}
              href={buildHref(from, r.days)}
              className={`px-2.5 py-1 text-[12px] font-medium transition ${
                active ? 'bg-cta text-white' : 'bg-paper text-graphite hover:bg-hairline/40'
              }`}
            >
              {r.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
