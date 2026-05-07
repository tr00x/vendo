import Link from 'next/link';
import type { Appointment, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { requireClinicStaff } from '@/lib/auth/guard';
import { CalendarIcon, ClockIcon } from '@/components/ui/icons';
import { ModalityBadge } from '@/components/dashboard/ModalityBadge';
import { PatientAvatar } from '@/components/dashboard/PatientAvatar';
import { formatTime, CLINIC_TZ, modalityMeta } from '@/lib/format';
import { ScheduleRangeNav } from '@/components/clinic/ScheduleRangeNav';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ from?: string; days?: string }>;
}

function parseDateOrToday(s?: string): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    if (!isNaN(d.getTime())) return startOfDay(d);
  }
  return startOfDay(new Date());
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function clampDays(s?: string): 1 | 3 | 7 | 14 {
  const n = parseInt(s ?? '7', 10);
  return ([1, 3, 7, 14] as const).includes(n as 1 | 3 | 7 | 14) ? (n as 1 | 3 | 7 | 14) : 7;
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const { medplum } = await requireClinicStaff();
  const params = await searchParams;
  const from = parseDateOrToday(params.from);
  const days = clampDays(params.days);
  const to = addDays(from, days);

  const today = startOfDay(new Date());

  // Fetch booked appointments in [from, to). Note: FHIR Appointment search
  // param is 'date', not 'start' — the latter throws "Unknown search parameter".
  const q = new URLSearchParams({
    status: 'booked',
    _sort: 'date',
    _count: '200',
  });
  q.append('date', `ge${from.toISOString()}`);
  q.append('date', `lt${to.toISOString()}`);

  let appts: Appointment[] = [];
  try {
    appts = await medplum.searchResources('Appointment', q.toString());
  } catch {
    appts = [];
  }

  // Bulk-resolve patients and SRs in parallel rather than serially.
  const patientIds = new Set<string>();
  const srIds = new Set<string>();
  for (const a of appts) {
    const pId = a.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'))?.actor?.reference?.split('/')[1];
    if (pId) patientIds.add(pId);
    const sId = a.basedOn?.[0]?.reference?.split('/')[1];
    if (sId) srIds.add(sId);
  }
  const [patientsArr, srsArr] = await Promise.all([
    Promise.all(Array.from(patientIds).map((id) => medplum.readResource('Patient', id).catch(() => undefined))),
    Promise.all(Array.from(srIds).map((id) => medplum.readResource('ServiceRequest', id).catch(() => undefined))),
  ]);
  const patientMap = new Map<string, Patient>();
  for (const p of patientsArr) if (p && p.id) patientMap.set(p.id, p as Patient);
  const srMap = new Map<string, ServiceRequest>();
  for (const s of srsArr) if (s && s.id) srMap.set(s.id, s as ServiceRequest);

  // Bulk-resolve referring practitioners — appointment cards show "Dr X".
  const requesterIds = new Set<string>();
  for (const sr of srsArr) {
    const rid = sr?.requester?.reference?.split('/')[1];
    if (rid) requesterIds.add(rid);
  }
  const requesterArr = await Promise.all(
    Array.from(requesterIds).map((id) =>
      medplum.readResource('Practitioner', id).catch(() => undefined),
    ),
  );
  const requesterMap = new Map<string, NonNullable<typeof requesterArr[number]>>();
  for (const p of requesterArr) if (p && p.id) requesterMap.set(p.id, p);

  // Group by day-key (clinic local date based on appointment.start ISO).
  interface DayItem { appointment: Appointment; patient?: Patient; serviceRequest?: ServiceRequest }
  const byDay = new Map<string, DayItem[]>();
  for (const a of appts) {
    if (!a.start) continue;
    const k = a.start.slice(0, 10);
    const arr = byDay.get(k) ?? [];
    const patientId = a.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'))?.actor?.reference?.split('/')[1];
    const srId = a.basedOn?.[0]?.reference?.split('/')[1];
    const item: DayItem = { appointment: a };
    if (patientId) {
      const p = patientMap.get(patientId);
      if (p) item.patient = p;
    }
    if (srId) {
      const s = srMap.get(srId);
      if (s) item.serviceRequest = s;
    }
    arr.push(item);
    byDay.set(k, arr);
  }

  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));

  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tightish text-ink">Schedule</h1>
          <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-smoke">
            Booked appointments. Step day-by-day or zoom out to a full week — click any row to open the referral.
          </p>
        </div>
        <div className="text-right text-[11.5px] text-smoke tabular">
          {appts.length} {appts.length === 1 ? 'appointment' : 'appointments'} · {CLINIC_TZ.replace('_', ' ')}
        </div>
      </div>

      <ScheduleRangeNav from={dayKey(from)} days={days} today={dayKey(today)} />

      {appts.length === 0 && (
        <div className="mt-6 flex items-center gap-3 rounded-md border border-dashed border-hairline bg-paper px-4 py-3 text-[13px] text-smoke">
          <CalendarIcon className="h-4 w-4 flex-shrink-0" />
          <span>
            Nothing booked in this range. Use the date pager or step out to a wider span — the
            grid below stays in view either way.
          </span>
        </div>
      )}
      {(() => {
        // Hour-by-day grid view. Y-axis = hours (clinic-local). X-axis = days.
        // Each appointment is an absolutely-positioned block within its day
        // column, offset top by (hour - startHour) * row + minute fraction.
        const ROW_H = 100; // px per hour — 30min slot = 50px, 1h = 100px
        const TIME_COL = 64; // px label column — fits "12 AM"/"12 PM"

        // Determine visible hour window from actual appts (clinic-local).
        const hourFromIso = (iso: string): number => {
          const fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: CLINIC_TZ,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const parts = fmt.formatToParts(new Date(iso));
          const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '9', 10);
          const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
          return h + m / 60;
        };
        const hours = appts.map((a) => (a.start ? hourFromIso(a.start) : 9));
        const minH = Math.max(0, Math.floor(Math.min(8, ...hours)));
        const maxH = Math.min(24, Math.ceil(Math.max(18, ...hours.map((h) => h + 0.5))));
        const hourList = Array.from({ length: maxH - minH }, (_, i) => minH + i);

        return (
          <div className="mt-6 overflow-hidden rounded-md border border-hairline bg-paper">
            {/* Day header row */}
            <div
              className="grid border-b border-hairline bg-bone"
              style={{ gridTemplateColumns: `${TIME_COL}px repeat(${days}, 1fr)` }}
            >
              <div />
              {dayList.map((d) => {
                const isToday = d.getTime() === today.getTime();
                const isTomorrow = d.getTime() === addDays(today, 1).getTime();
                const isPast = d < today;
                return (
                  <div key={dayKey(d)} className="border-l border-hairline px-3 py-2.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-[10.5px] font-semibold uppercase tracking-microcaps ${isPast ? 'text-ash' : 'text-smoke'}`}>
                        {d.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className={`text-[14px] font-semibold tracking-tightish ${isPast ? 'text-smoke' : 'text-ink'}`}>
                        {d.getDate()}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-cta px-1.5 py-0 text-[9px] font-semibold uppercase tracking-microcaps text-white">
                          Today
                        </span>
                      )}
                      {isTomorrow && (
                        <span className="rounded-full bg-bone px-1.5 py-0 text-[9px] font-semibold uppercase tracking-microcaps text-graphite ring-1 ring-inset ring-hairline">
                          Tomorrow
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-smoke">
                      {(byDay.get(dayKey(d))?.length ?? 0)} {(byDay.get(dayKey(d))?.length ?? 0) === 1 ? 'appt' : 'appts'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time grid body */}
            <div
              className="relative grid"
              style={{ gridTemplateColumns: `${TIME_COL}px repeat(${days}, 1fr)` }}
            >
              {/* Hour labels column */}
              <div className="flex flex-col">
                {hourList.map((h) => {
                  const hr12 = (h % 12) || 12;
                  const meridiem = h < 12 ? 'AM' : 'PM';
                  return (
                    <div
                      key={h}
                      className="flex items-start justify-end border-t border-hairline pr-2 pt-1 text-[10.5px] tabular text-smoke"
                      style={{ height: `${ROW_H}px` }}
                    >
                      <span className="font-medium text-graphite">{hr12}</span>
                      <span className="ml-0.5 text-[9px] uppercase">{meridiem}</span>
                    </div>
                  );
                })}
              </div>

              {/* Day columns with hour rows + appointment blocks */}
              {dayList.map((d) => {
                const items = byDay.get(dayKey(d)) ?? [];
                // Greedy lane allocator: place each appointment in the
                // earliest lane whose previous block ended before this one
                // starts. Then total `lanes.length` is how many side-by-side
                // columns we need to render.
                const sorted = [...items].sort(
                  (a, b) => (a.appointment.start ?? '').localeCompare(b.appointment.start ?? ''),
                );
                const lanes: number[] = []; // lanes[i] = end-time-ms of last appt in lane i
                const placed = sorted.map((it) => {
                  const startMs = new Date(it.appointment.start ?? 0).getTime();
                  const endMs = it.appointment.end
                    ? new Date(it.appointment.end).getTime()
                    : startMs + 30 * 60_000;
                  let lane = lanes.findIndex((laneEnd) => laneEnd <= startMs);
                  if (lane === -1) {
                    lane = lanes.length;
                    lanes.push(endMs);
                  } else {
                    lanes[lane] = endMs;
                  }
                  return { ...it, lane };
                });
                const totalLanes = Math.max(1, lanes.length);
                // Cap visible lanes at 4 — beyond that, narrower-than-readable.
                // Overflow apps get hidden but a "+N more" pill renders below.
                const VISIBLE_LANES = 4;
                const renderLanes = Math.min(totalLanes, VISIBLE_LANES);
                const overflowCount = placed.filter((p) => p.lane >= VISIBLE_LANES).length;
                return (
                  <div key={dayKey(d)} className="relative border-l border-hairline">
                    {hourList.map((h) => (
                      <div
                        key={h}
                        className="border-t border-hairline"
                        style={{ height: `${ROW_H}px` }}
                      />
                    ))}
                    {overflowCount > 0 && (
                      <div className="absolute right-1 top-1 z-20 rounded-full bg-amber-500 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-microcaps text-white" title={`${overflowCount} more appointment${overflowCount === 1 ? '' : 's'} hidden — overlapping slots`}>
                        +{overflowCount} more
                      </div>
                    )}
                    {placed.filter((p) => p.lane < VISIBLE_LANES).map(({ appointment, patient, serviceRequest, lane }) => {
                      if (!appointment.start) return null;
                      const startHourFloat = hourFromIso(appointment.start);
                      const top = (startHourFloat - minH) * ROW_H;
                      const dur = appointment.end
                        ? Math.max(0.5, (new Date(appointment.end).getTime() - new Date(appointment.start).getTime()) / 3_600_000)
                        : 0.5;
                      const height = Math.max(40, dur * ROW_H - 2);
                      const code = serviceRequest?.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code;
                      const mod = modalityMeta(code);
                      const fullName = `${patient?.name?.[0]?.given?.[0] ?? ''} ${patient?.name?.[0]?.family ?? ''}`.trim() || 'Unknown patient';
                      const requester = serviceRequest?.requester?.reference?.split('/')[1];
                      const reqResource = requester ? requesterMap.get(requester) : undefined;
                      const reqRoleTag = reqResource?.identifier?.find(
                        (i) => i.system === 'http://vendo.local/role',
                      )?.value;
                      const isWalkIn = reqRoleTag === 'ClinicStaff' || reqRoleTag === 'Admin';
                      const reqLabel = reqResource?.name?.[0]
                        ? isWalkIn
                          ? `Walk-in · ${reqResource.name[0].given?.[0] ?? ''} ${reqResource.name[0].family ?? ''}`.trim()
                          : `Dr ${reqResource.name[0].given?.[0] ?? ''} ${reqResource.name[0].family ?? ''}`.trim()
                        : null;
                      const href = serviceRequest?.id ? `/clinic/inbox/${serviceRequest.id}` : '#';
                      const widthPct = 100 / renderLanes;
                      const leftPct = lane * widthPct;
                      const showFull = height >= 80;
                      const showMid = height >= 56;
                      return (
                        <Link
                          key={appointment.id}
                          href={href}
                          title={`${fullName} · ${formatTime(appointment.start)} · ${serviceRequest?.code?.text ?? code ?? ''}${reqLabel ? ` · ${reqLabel}` : ''}`}
                          className={`group absolute flex flex-col overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-[11.5px] leading-tight text-ink ring-1 ring-inset transition hover:z-10 hover:shadow-md ${mod.cardClass}`}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            left: `calc(${leftPct}% + 2px)`,
                            width: `calc(${widthPct}% - 4px)`,
                          }}
                        >
                          {/* Time + modality + walk-in badge */}
                          <div className="flex items-center gap-1.5">
                            <span className={`font-mono text-[10.5px] font-semibold tabular ${mod.textStrong}`}>
                              {formatTime(appointment.start)?.replace(/\sET$/, '')}
                            </span>
                            <span className={`rounded px-1 text-[9px] font-semibold uppercase tracking-microcaps ring-1 ring-inset ${mod.chipClass}`}>
                              {code ?? '—'}
                            </span>
                            {isWalkIn && (
                              <span className="rounded bg-cta px-1 text-[9px] font-semibold uppercase tracking-microcaps text-white" title="Booked by clinic staff at the front desk">
                                Walk-in
                              </span>
                            )}
                          </div>
                          {/* Patient name — always shown */}
                          <div className="mt-0.5 truncate text-[12px] font-semibold tracking-tightish text-ink">
                            {fullName}
                          </div>
                          {/* Study + doctor + open — conditional on space */}
                          {showMid && (
                            <div className="mt-0.5 truncate text-[10.5px] text-graphite">
                              {serviceRequest?.code?.text ?? code ?? '—'}
                            </div>
                          )}
                          {showFull && reqLabel && (
                            <div className="mt-0.5 truncate text-[10px] text-smoke">
                              ↳ {reqLabel}
                            </div>
                          )}
                          {/* Open hint pinned to bottom-right when there's room */}
                          {showFull && (
                            <span className={`mt-auto self-end rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-microcaps ring-1 ring-inset opacity-0 transition group-hover:opacity-100 ${mod.chipClass}`}>
                              Open →
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
