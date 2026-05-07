'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRightIcon, CalendarIcon } from '@/components/ui/icons';
import { CLINIC_TZ, CLINIC_TZ_LABEL } from '@/lib/format';

export interface SlotSummary {
  id: string;
  start: string;
  end: string;
}

interface Props {
  slots: SlotSummary[];
  selectedSlotId?: string | null;
  onPick: (slot: SlotSummary | null) => void;
  timezone?: string;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoDayKey(iso: string): string {
  return iso.slice(0, 10);
}

const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MINI_WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CalendarPicker({ slots, selectedSlotId, onPick, timezone }: Props) {
  // All visible labels render in the clinic timezone so a doctor browsing
  // from Pacific time still sees ET slot times. The fall-through to the
  // browser TZ only kicks in if a future caller explicitly asks for it.
  const tz = timezone ?? CLINIC_TZ;
  const [twelveHour, setTwelveHour] = useState(true);

  const today = useMemo(() => startOfDay(new Date()), []);

  const byDayKey = useMemo(() => {
    const m = new Map<string, SlotSummary[]>();
    for (const s of slots) {
      const k = isoDayKey(s.start);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.start.localeCompare(b.start));
    return m;
  }, [slots]);

  const slotsByStartIso = useMemo(() => {
    const m = new Map<string, SlotSummary>();
    for (const s of slots) m.set(s.start, s);
    return m;
  }, [slots]);

  const earliestSlotDate = useMemo(() => {
    const e = slots.reduce<string | null>((acc, s) => (!acc || s.start < acc ? s.start : acc), null);
    return e ? startOfWeek(new Date(e)) : startOfWeek(today);
  }, [slots, today]);

  const [weekStart, setWeekStart] = useState<Date>(earliestSlotDate);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(weekStart));

  const slotsThisWeek = useMemo(() => {
    return days.reduce((sum, d) => sum + (byDayKey.get(dayKey(d))?.length ?? 0), 0);
  }, [days, byDayKey]);

  const nextSlotDate = useMemo(() => {
    if (slotsThisWeek > 0) return null;
    const weekEnd = addDays(weekStart, 7);
    const future = slots.find((s) => new Date(s.start) >= weekEnd);
    return future ? new Date(future.start) : null;
  }, [slots, weekStart, slotsThisWeek]);

  const { startHour, endHour } = useMemo(() => {
    if (slots.length === 0) return { startHour: 9, endHour: 17 };
    let minH = 24;
    let maxH = 0;
    for (const s of slots) {
      const d = new Date(s.start);
      const h = d.getHours();
      if (h < minH) minH = h;
      const e = new Date(s.end);
      const eh = e.getHours() + (e.getMinutes() > 0 ? 1 : 0);
      if (eh > maxH) maxH = eh;
    }
    return { startHour: Math.max(0, minH), endHour: Math.min(24, Math.max(maxH, minH + 1)) };
  }, [slots]);

  const halfHourSlots = useMemo(() => {
    const arr: { hour: number; minute: 0 | 30 }[] = [];
    for (let h = startHour; h < endHour; h++) {
      arr.push({ hour: h, minute: 0 });
      arr.push({ hour: h, minute: 30 });
    }
    return arr;
  }, [startHour, endHour]);

  function gotoWeek(direction: -1 | 1) {
    setWeekStart((w) => addDays(w, direction * 7));
  }

  function gotoMonth(direction: -1 | 1) {
    setViewMonth((m) => addMonths(m, direction));
  }

  function pickDayInMiniMonth(d: Date) {
    setWeekStart(startOfWeek(d));
    setViewMonth(startOfMonth(d));
  }

  function formatHour(h: number, m: number = 0): string {
    const date = new Date();
    date.setHours(h, m, 0, 0);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: twelveHour,
      timeZone: tz,
    });
  }

  function formatWeekRange(): string {
    const last = addDays(weekStart, 6);
    const sameMonth = weekStart.getMonth() === last.getMonth();
    const sameYear = weekStart.getFullYear() === last.getFullYear();
    if (sameMonth) {
      return `${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: tz })}–${last.getDate()}, ${last.getFullYear()}`;
    }
    if (sameYear) {
      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz })}, ${last.getFullYear()}`;
    }
    return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz })}`;
  }

  const miniMonthCells = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const startDate = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(startDate, i);
      const arr = byDayKey.get(dayKey(d)) ?? [];
      return {
        date: d,
        inMonth: d.getMonth() === viewMonth.getMonth(),
        hasSlots: arr.length > 0,
        count: arr.length,
      };
    });
  }, [viewMonth, byDayKey]);

  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!gridRef.current) return;
  }, [weekStart]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      {/* Sidebar mini-month */}
      <aside className="rounded-md border border-hairline bg-paper p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => gotoMonth(-1)}
            className="rounded p-1 text-smoke hover:bg-hairline/60 hover:text-ink"
            aria-label="Previous month"
            title="Previous month"
          >
            <ChevronRightIcon className="h-4 w-4 rotate-180" />
          </button>
          <div className="text-[13.5px] font-semibold tracking-tightish text-ink">
            {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: tz })}
          </div>
          <button
            type="button"
            onClick={() => gotoMonth(1)}
            className="rounded p-1 text-smoke hover:bg-hairline/60 hover:text-ink"
            aria-label="Next month"
            title="Next month"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase text-ash">
          {MINI_WEEKDAY.map((d, i) => (
            <div key={i} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {miniMonthCells.map((cell, i) => {
            const isToday = sameDay(cell.date, today);
            const isPast = cell.date < today;
            const isInWeek = cell.date >= weekStart && cell.date < addDays(weekStart, 7);
            const disabled = !cell.hasSlots || isPast || !cell.inMonth;
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => pickDayInMiniMonth(cell.date)}
                className={`relative flex h-8 items-center justify-center rounded text-[12px] transition ${
                  !cell.inMonth
                    ? 'text-ash'
                    : isPast
                    ? 'text-ash cursor-not-allowed'
                    : isInWeek
                    ? cell.hasSlots
                      ? 'bg-bone text-ink font-semibold ring-1 ring-inset ring-ink/30 hover:bg-hairline cursor-pointer'
                      : 'text-ash ring-1 ring-inset ring-hairline cursor-not-allowed'
                    : isToday
                    ? 'bg-bone text-ink font-semibold ring-1 ring-inset ring-hairline'
                    : disabled
                    ? 'text-ash cursor-not-allowed'
                    : 'text-graphite hover:bg-hairline/50 hover:text-ink cursor-pointer'
                }`}
                aria-label={cell.date.toDateString()}
                title={cell.hasSlots && !isPast ? `${cell.count} slot${cell.count === 1 ? '' : 's'} available` : isPast ? 'Past' : 'No slots'}
              >
                {cell.date.getDate()}
                {cell.hasSlots && cell.inMonth && !isPast && !isInWeek && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-500" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-hairline pt-3 text-[11.5px] text-smoke">
          <div className="flex items-center gap-1.5" title="All slot times shown in this timezone">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span className="truncate">{tz}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Has slots
            </span>
            <span className="flex items-center gap-1.5">
              <HatchSwatch /> Booked / unavailable
            </span>
          </div>
        </div>
      </aside>

      {/* Week grid */}
      <div className="rounded-md border border-hairline bg-paper">
        <header className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
          <h3 className="text-[14px] font-semibold tracking-tightish text-ink">{formatWeekRange()}</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => gotoWeek(-1)}
              className="rounded p-1.5 text-smoke hover:bg-hairline/60 hover:text-ink"
              aria-label="Previous week"
              title="Previous week"
            >
              <ChevronRightIcon className="h-4 w-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(startOfWeek(today))}
              className="rounded px-2 py-1 text-[12px] font-medium text-graphite hover:bg-hairline/60 hover:text-ink"
              title="Jump to this week"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => gotoWeek(1)}
              className="rounded p-1.5 text-smoke hover:bg-hairline/60 hover:text-ink"
              aria-label="Next week"
              title="Next week"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            <div className="ml-2 inline-flex overflow-hidden rounded border border-hairline" title="Time format">
              <button
                type="button"
                onClick={() => setTwelveHour(true)}
                className={`px-2 py-1 text-[11.5px] font-medium ${twelveHour ? 'bg-cta text-white' : 'bg-paper text-graphite hover:bg-hairline/40'}`}
              >
                12h
              </button>
              <button
                type="button"
                onClick={() => setTwelveHour(false)}
                className={`px-2 py-1 text-[11.5px] font-medium ${!twelveHour ? 'bg-cta text-white' : 'bg-paper text-graphite hover:bg-hairline/40'}`}
              >
                24h
              </button>
            </div>
          </div>
        </header>

        <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,1fr)] border-b border-hairline bg-paper">
          <div />
          {days.map((d) => {
            const isToday = sameDay(d, today);
            const dayHasSlots = (byDayKey.get(dayKey(d)) ?? []).length > 0;
            return (
              <div
                key={d.toISOString()}
                className={`flex flex-col items-center justify-center px-2 py-2 text-center ${
                  isToday ? 'bg-bone' : ''
                }`}
              >
                <div className={`text-[10px] font-medium uppercase tracking-microcaps ${isToday ? 'text-ink' : 'text-smoke'}`}>
                  {WEEKDAY_SHORT[d.getDay()]}
                </div>
                <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${
                  isToday
                    ? 'bg-cta text-white font-semibold'
                    : dayHasSlots
                    ? 'text-ink font-semibold'
                    : 'text-ash'
                }`}>
                  {String(d.getDate()).padStart(2, '0')}
                </div>
              </div>
            );
          })}
        </div>

        <div ref={gridRef} className="relative max-h-[440px] overflow-y-auto">
          {slotsThisWeek === 0 && (
            <div className="border-b border-hairline bg-bone px-5 py-4 text-[13px] leading-relaxed text-graphite">
              <span className="font-semibold text-ink">No available times this week.</span>{' '}
              {nextSlotDate ? (
                <>
                  Next opening is{' '}
                  <button
                    type="button"
                    onClick={() => setWeekStart(startOfWeek(nextSlotDate))}
                    className="font-semibold text-accent underline-offset-2 hover:underline"
                  >
                    {nextSlotDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      timeZone: tz,
                    })}
                  </button>
                  . Or use &quot;Clinic will call&quot; below.
                </>
              ) : (
                <>No future openings either — let the clinic call your patient by clicking &quot;Clinic will call&quot; below.</>
              )}
            </div>
          )}
          <div className="grid grid-cols-[56px_repeat(7,1fr)]">
            {halfHourSlots.map((row) => (
              <Row
                key={`${row.hour}-${row.minute}`}
                row={row}
                days={days}
                slotsByStartIso={slotsByStartIso}
                selectedSlotId={selectedSlotId}
                today={today}
                onPick={onPick}
                formatHour={formatHour}
                tz={tz}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  row,
  days,
  slotsByStartIso,
  selectedSlotId,
  today,
  onPick,
  formatHour,
  tz,
}: {
  row: { hour: number; minute: 0 | 30 };
  days: Date[];
  slotsByStartIso: Map<string, SlotSummary>;
  selectedSlotId: string | null | undefined;
  today: Date;
  onPick: (s: SlotSummary | null) => void;
  formatHour: (h: number, m?: number) => string;
  tz: string;
}) {
  const showHourLabel = row.minute === 0;
  return (
    <>
      <div className="flex h-10 items-start justify-end pr-2 pt-0 text-[10px] text-ash">
        {showHourLabel ? formatHour(row.hour, 0) : ''}
      </div>
      {days.map((day) => {
        const cellDate = new Date(day);
        cellDate.setHours(row.hour, row.minute, 0, 0);
        const iso = cellDate.toISOString();
        const slot = slotsByStartIso.get(iso);
        const isPast = cellDate < new Date();
        const isSelected = slot && slot.id === selectedSlotId;
        const available = slot && !isPast;
        const isToday = sameDay(day, today);
        const isHourBoundary = row.minute === 0;

        if (!available) {
          return (
            <div
              key={day.toISOString() + row.hour + row.minute}
              className={`relative h-10 border-l border-hairline bg-hairline/40 ${isHourBoundary ? 'border-t border-t-hairline' : 'border-t border-t-hairline/50'} dark:bg-rule/30`}
              title="Not available"
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(-45deg, var(--hatch), var(--hatch) 3px, transparent 3px, transparent 6px)',
                }}
              />
            </div>
          );
        }

        return (
          <button
            key={day.toISOString() + row.hour + row.minute}
            type="button"
            onClick={() => onPick(isSelected ? null : slot)}
            aria-pressed={isSelected ? true : false}
            aria-label={`${cellDate.toLocaleString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: tz,
            })} ${CLINIC_TZ_LABEL}`}
            title={isSelected ? 'Click again to unpick this time' : `Available — click to pick ${cellDate.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })}`}
            className={`relative h-10 border-l border-hairline transition ${isHourBoundary ? 'border-t border-t-hairline' : 'border-t border-t-hairline/50'} ${
              isSelected
                ? 'bg-paper'
                : 'bg-paper hover:bg-accent/5 hover:ring-1 hover:ring-inset hover:ring-accent/30 cursor-pointer'
            }`}
          >
            {isSelected && (
              <span className="absolute inset-0.5 flex items-center justify-center rounded bg-cta text-[11px] font-semibold text-white">
                {formatHour(row.hour, row.minute)}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function HatchSwatch() {
  return (
    <span
      className="inline-block h-2.5 w-3.5 overflow-hidden rounded-sm border border-hairline"
      style={{
        backgroundImage:
          'repeating-linear-gradient(-45deg, var(--hatch), var(--hatch) 3px, transparent 3px, transparent 6px)',
      }}
    />
  );
}
