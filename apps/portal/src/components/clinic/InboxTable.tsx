'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Patient, Practitioner, ServiceRequest, Appointment } from '@medplum/fhirtypes';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ModalityBadge } from '@/components/dashboard/ModalityBadge';
import { PatientCell } from '@/components/dashboard/PatientAvatar';
import { ChevronRightIcon, SearchIcon, XIcon, CheckCircleIcon, FileIcon } from '@/components/ui/icons';
import { timeAgo, formatDateTime } from '@/lib/format';
import { deriveStage, slaAlert } from '@/lib/stage';

export interface InboxRow {
  serviceRequest: ServiceRequest;
  patient?: Patient | undefined;
  requester?: Practitioner | undefined;
  appointment?: Appointment | undefined;
}

const TABS = [
  { value: 'pending',   label: 'Pending',   description: 'Need an appointment.' },
  { value: 'scheduled', label: 'Scheduled', description: 'Booked, not yet seen.' },
  { value: 'completed', label: 'Completed', description: 'Imaging finished.' },
  { value: 'all',       label: 'All',       description: 'Every referral.' },
] as const;

const STAT_CELLS = [
  { key: 'pending',   label: 'Needs action', hint: 'No appointment yet.',          dot: 'bg-amber-500' },
  { key: 'scheduled', label: 'Scheduled',    hint: 'Booked, awaiting visit.',      dot: 'bg-accent' },
  { key: 'completed', label: 'Completed',    hint: 'Imaging finished.',            dot: 'bg-emerald-500' },
  { key: 'total',     label: 'Total',        hint: 'Every referral on file.',      dot: null },
] as const;

function modalityCode(sr: ServiceRequest): string | undefined {
  return sr.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code;
}
function reasonText(sr: ServiceRequest): string {
  return sr.reasonCode?.[0]?.text ?? sr.reasonCode?.[0]?.coding?.[0]?.display ?? '';
}
function patientName(p?: Patient): string {
  return `${p?.name?.[0]?.given?.[0] ?? ''} ${p?.name?.[0]?.family ?? ''}`.trim();
}
function requesterName(p?: Practitioner): string {
  if (!p?.name?.[0]) return '—';
  const n = p.name[0];
  return `Dr ${n.given?.[0] ?? ''} ${n.family ?? ''}`.trim();
}

const ROLE_SYSTEM = 'http://vendo.local/role';

/** Returns 'walk-in' when the requester is ClinicStaff (= self-booked at
 *  the front desk) and 'referral' otherwise. Decision is identifier-tag
 *  driven so it never depends on display-name heuristics. */
function bookingSource(p?: Practitioner): 'walk-in' | 'referral' {
  const tag = p?.identifier?.find((i) => i.system === ROLE_SYSTEM)?.value;
  return tag === 'ClinicStaff' || tag === 'Admin' ? 'walk-in' : 'referral';
}

function staffDisplay(p?: Practitioner): string {
  if (!p?.name?.[0]) return 'Front desk';
  const n = p.name[0];
  return `${n.given?.[0] ?? ''} ${n.family ?? ''}`.trim() || 'Front desk';
}

export function InboxTable({ rows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('pending');

  const [smartFilter, setSmartFilter] = useState<'none' | 'stuck' | 'no-insurance'>('none');

  const stats = useMemo(() => {
    let pending = 0, scheduled = 0, completed = 0;
    for (const r of rows) {
      const s = r.serviceRequest.status;
      if (s === 'completed') completed++;
      else if (s === 'active' && r.appointment?.status === 'booked') scheduled++;
      else if (s === 'active') pending++;
    }
    return { pending, scheduled, completed, total: rows.length };
  }, [rows]);

  // Smart-filter counts — computed once over all rows so the chip badges
  // show real-time numbers regardless of the current tab/search.
  const smartCounts = useMemo(() => {
    let stuck = 0;
    let noInsurance = 0;
    for (const r of rows) {
      const sr = r.serviceRequest;
      const stage = deriveStage({ sr, ...(r.appointment ? { appointment: r.appointment } : {}) });
      if (slaAlert(stage, sr.meta?.lastUpdated)) stuck++;
      const ins = sr.extension?.find((x) => x.url === 'http://vendo.local/ext/insurance');
      const hasIns = ins?.extension?.some((e) => (e.url === 'payor' || e.url === 'memberId') && e.valueString);
      if (sr.status === 'active' && !hasIns) noInsurance++;
    }
    return { stuck, noInsurance };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const sr = r.serviceRequest;
      if (tab !== 'all') {
        const s = sr.status;
        const isScheduled = s === 'active' && r.appointment?.status === 'booked';
        const isPending = s === 'active' && !isScheduled;
        if (tab === 'pending' && !isPending) return false;
        if (tab === 'scheduled' && !isScheduled) return false;
        if (tab === 'completed' && s !== 'completed') return false;
      }
      if (smartFilter === 'stuck') {
        const stage = deriveStage({ sr, ...(r.appointment ? { appointment: r.appointment } : {}) });
        if (!slaAlert(stage, sr.meta?.lastUpdated)) return false;
      }
      if (smartFilter === 'no-insurance') {
        const ins = sr.extension?.find((x) => x.url === 'http://vendo.local/ext/insurance');
        const hasIns = ins?.extension?.some((e) => (e.url === 'payor' || e.url === 'memberId') && e.valueString);
        if (sr.status !== 'active' || hasIns) return false;
      }
      if (query) {
        const q = query.toLowerCase();
        const fields = [
          patientName(r.patient),
          requesterName(r.requester),
          modalityCode(sr) ?? '',
          sr.code?.text ?? '',
          reasonText(sr),
        ].join(' ').toLowerCase();
        if (!fields.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, tab, smartFilter]);

  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tightish text-ink">Inbox</h1>
          <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-smoke">
            Every referral every doctor has sent. Click a row to schedule, message the doctor, or close it out.
          </p>
        </div>
      </div>

      {/* Stat tiles — banded card, large numbers, descriptive hints */}
      <div className="mb-6 grid grid-cols-2 overflow-hidden rounded-md border border-hairline bg-paper sm:grid-cols-4">
        {STAT_CELLS.map((c, idx) => {
          const value = stats[c.key];
          return (
            <div
              key={c.key}
              title={c.hint}
              className={`flex flex-col gap-1 px-5 py-4 ${
                idx > 0 ? 'border-t border-hairline sm:border-l sm:border-t-0' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                {c.dot && (
                  <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden />
                )}
                <span className="text-[12.5px] font-medium text-graphite">{c.label}</span>
              </div>
              <div className="text-[28px] font-semibold leading-none tracking-tightish tabular text-ink">
                {value}
              </div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-smoke">{c.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-4 rounded-md border border-hairline bg-paper">
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ash" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by patient, doctor, study, or reason…"
              className="w-full rounded-md border border-hairline bg-bone py-2 pl-9 pr-9 text-[14px] text-ink placeholder:text-ash focus:border-ink/30 focus:bg-paper focus:outline-none focus:ring-2 focus:ring-ink/5"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-smoke hover:bg-hairline hover:text-ink"
                aria-label="Clear search"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {/* Smart-filter chips — surface stuck rows and missing-insurance
            rows that need clinic action. Counts auto-update with row data. */}
        {(smartCounts.stuck > 0 || smartCounts.noInsurance > 0 || smartFilter !== 'none') && (
          <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-microcaps text-smoke">
              Needs attention
            </span>
            {smartCounts.stuck > 0 && (
              <button
                type="button"
                onClick={() => setSmartFilter(smartFilter === 'stuck' ? 'none' : 'stuck')}
                title="Referrals that have not progressed within the SLA window"
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset transition ${
                  smartFilter === 'stuck'
                    ? 'bg-amber-500 text-white ring-amber-500'
                    : 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30 dark:hover:bg-amber-500/25'
                }`}
              >
                ⏱ Stuck <span className="tabular">({smartCounts.stuck})</span>
              </button>
            )}
            {smartCounts.noInsurance > 0 && (
              <button
                type="button"
                onClick={() => setSmartFilter(smartFilter === 'no-insurance' ? 'none' : 'no-insurance')}
                title="Active referrals without insurance info — clinic must call patient"
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset transition ${
                  smartFilter === 'no-insurance'
                    ? 'bg-signal-stop text-white ring-signal-stop'
                    : 'bg-signal-stop/10 text-signal-stop ring-signal-stop/30 hover:bg-signal-stop/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30 dark:hover:bg-red-500/25'
                }`}
              >
                No insurance <span className="tabular">({smartCounts.noInsurance})</span>
              </button>
            )}
            {smartFilter !== 'none' && (
              <button
                type="button"
                onClick={() => setSmartFilter('none')}
                className="text-[11.5px] font-medium text-smoke hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => {
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  title={t.description}
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
            {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-hairline bg-paper px-8 py-16 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bone text-smoke">
              <FileIcon className="h-5 w-5" />
            </div>
            <h3 className="text-[16px] font-semibold tracking-tightish text-ink">No referrals yet</h3>
            <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-smoke">
              When referring doctors send patients for imaging, they&apos;ll show up here.
            </p>
          </div>
        ) : query ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-hairline bg-paper px-8 py-16 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bone text-smoke">
              <SearchIcon className="h-5 w-5" />
            </div>
            <h3 className="text-[16px] font-semibold tracking-tightish text-ink">No matches</h3>
            <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-smoke">
              No referrals match &ldquo;{query}&rdquo;. Try a different search or clear filters.
            </p>
            <button type="button" onClick={() => setQuery('')} className="btn-secondary mt-4">
              Clear search
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-hairline bg-paper px-8 py-16 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircleIcon className="h-5 w-5" />
            </div>
            <h3 className="text-[16px] font-semibold tracking-tightish text-ink">All clear</h3>
            <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-smoke">
              {tab === 'pending'
                ? 'No pending referrals — everyone has an appointment.'
                : tab === 'scheduled'
                ? 'No upcoming appointments in this view.'
                : tab === 'completed'
                ? 'No completed studies in this view yet.'
                : 'Nothing in this tab right now.'}
            </p>
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline bg-paper">
          <div className="hidden grid-cols-[2fr_1.6fr_1.6fr_1.1fr_1.2fr_28px] gap-4 border-b border-hairline bg-bone px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-microcaps text-smoke md:grid">
            <div title="The patient this referral is for.">Patient</div>
            <div title="The doctor who sent the referral.">Referring doctor</div>
            <div title="What kind of imaging was ordered.">Study</div>
            <div title="Where this referral stands.">Status</div>
            <div title="Booked appointment, or last update.">When</div>
            <div></div>
          </div>
          <ul className="divide-y divide-hairline">
            {filtered.map((r) => {
              const sr = r.serviceRequest;
              const code = modalityCode(sr);
              const reason = reasonText(sr);
              const updated = sr.meta?.lastUpdated;
              const apptTime = r.appointment?.start;
              const isScheduled = r.appointment?.status === 'booked';
              const goToDetail = () => router.push(`/clinic/inbox/${sr.id}`);
              const requesterEmail = r.requester?.telecom?.find((t) => t.system === 'email')?.value;
              const requesterPractice = r.requester?.qualification?.[0]?.code?.text;
              return (
                <li
                  key={sr.id}
                  role="link"
                  tabIndex={0}
                  title="Click to open this referral"
                  onClick={goToDetail}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goToDetail();
                    }
                  }}
                  className="group cursor-pointer transition hover:bg-bone focus:bg-bone focus:outline-none"
                >
                  <div className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-[2fr_1.6fr_1.6fr_1.1fr_1.2fr_28px] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <PatientCell patient={r.patient} />
                      {reason && (
                        <div className="ml-[44px] mt-1.5 hidden truncate text-[12.5px] leading-snug text-smoke md:block">
                          <span className="text-graphite">Reason:</span> {reason}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      {bookingSource(r.requester) === 'walk-in' ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center rounded-full bg-cta px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-microcaps text-white" title="Booked by clinic staff at the front desk — no outside referrer">
                              Walk-in
                            </span>
                            <div className="truncate text-[13.5px] font-medium tracking-tightish text-ink" title={`Booked by ${staffDisplay(r.requester)}`}>
                              {staffDisplay(r.requester)}
                            </div>
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-smoke">Front desk</div>
                        </>
                      ) : (
                        <>
                          <div className="truncate text-[14px] font-medium tracking-tightish text-ink" title={requesterName(r.requester)}>
                            {requesterName(r.requester)}
                          </div>
                          <div className="truncate text-[11.5px] text-smoke" title={requesterPractice ?? requesterEmail}>
                            {requesterPractice ?? requesterEmail ?? ''}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ModalityBadge code={code} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium tracking-tightish text-ink" title={sr.code?.text ?? code ?? ''}>
                          {sr.code?.text ?? code ?? '—'}
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      {(() => {
                        const stage = deriveStage({ sr, ...(r.appointment ? { appointment: r.appointment } : {}) });
                        const sla = slaAlert(stage, sr.meta?.lastUpdated);
                        return (
                          <>
                            {sr.status === 'revoked' || sr.status === 'on-hold' ? (
                              <StatusBadge status={sr.status} />
                            ) : (
                              <StatusBadge stage={stage} />
                            )}
                            {sla && (
                              <span
                                title={`No movement for ${sla.days} ${sla.days === 1 ? 'day' : 'days'} — beyond SLA. Action expected.`}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${
                                  sla.severity === 'danger'
                                    ? 'bg-signal-stop/10 text-signal-stop ring-signal-stop/30 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30'
                                    : 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30'
                                }`}
                              >
                                ⏱ Stuck {sla.days}d
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex min-w-0 flex-col leading-tight">
                      {apptTime ? (
                        <>
                          <span className="truncate text-[13px] font-medium text-ink tabular" title={formatDateTime(apptTime)}>
                            {formatDateTime(apptTime)}
                          </span>
                          <span className="mt-0.5 text-[11.5px] text-smoke">Appointment</span>
                        </>
                      ) : (
                        <>
                          <span className="truncate text-[13px] text-graphite">{timeAgo(updated)}</span>
                          <span className="mt-0.5 text-[11.5px] text-smoke">Last update</span>
                        </>
                      )}
                    </div>
                    <div className="hidden items-center justify-end text-ash transition group-hover:text-ink md:flex">
                      <ChevronRightIcon className="h-4 w-4" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
