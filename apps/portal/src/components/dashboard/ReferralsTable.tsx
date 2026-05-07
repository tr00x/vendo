'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Patient, ServiceRequest, Appointment } from '@medplum/fhirtypes';
import { StatusBadge } from './StatusBadge';
import { ModalityBadge } from './ModalityBadge';
import { PatientCell } from './PatientAvatar';
import { Filters } from './Filters';
import { StatCards, type DashboardStats } from './StatCards';
import { EmptyState } from './EmptyState';
import { timeAgo, formatDateTime } from '@/lib/format';
import { deriveStage } from '@/lib/stage';
import { ChevronRightIcon, FilePlusIcon, PlusIcon } from '@/components/ui/icons';

export interface ReferralRow {
  serviceRequest: ServiceRequest;
  patient?: Patient;
  appointment?: Appointment;
}

function modalityCode(sr: ServiceRequest): string | undefined {
  return sr.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code;
}

function reasonText(sr: ServiceRequest): string {
  return sr.reasonCode?.[0]?.text ?? sr.reasonCode?.[0]?.coding?.[0]?.display ?? '';
}

function patientName(p?: Patient): string {
  return `${p?.name?.[0]?.given?.[0] ?? ''} ${p?.name?.[0]?.family ?? ''}`.trim();
}

export function ReferralsTable({ rows }: { rows: ReferralRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [modality, setModality] = useState('all');

  const stats = useMemo<DashboardStats>(() => {
    let pending = 0, scheduled = 0, completed = 0;
    for (const r of rows) {
      const s = r.serviceRequest.status;
      if (s === 'completed') {
        completed++;
      } else if (s === 'active' && r.appointment?.status === 'booked') {
        scheduled++;
      } else if (s === 'active') {
        pending++;
      }
    }
    return { total: rows.length, pending, scheduled, completed };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const sr = r.serviceRequest;
      if (status !== 'all') {
        if (status === 'scheduled') {
          if (!r.appointment || r.appointment.status !== 'booked') return false;
        } else if (status === 'active') {
          if (sr.status !== 'active' || (r.appointment && r.appointment.status === 'booked')) return false;
        } else if (sr.status !== status) return false;
      }
      if (modality !== 'all' && modalityCode(sr) !== modality) return false;
      if (query) {
        const q = query.toLowerCase();
        const fields = [
          patientName(r.patient),
          modalityCode(sr) ?? '',
          sr.code?.text ?? '',
          reasonText(sr),
        ].join(' ').toLowerCase();
        if (!fields.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, status, modality]);

  return (
    <div>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tightish text-ink">Your referrals</h1>
          <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-smoke">
            Every patient you&apos;ve sent for imaging — from the moment you submit the referral until the study is read.
            Click any row to see the full picture.
          </p>
        </div>
        <Link
          href="/refer"
          className="btn-primary"
          title="Send a new patient for imaging"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New referral
        </Link>
      </div>

      <StatCards stats={stats} />

      {/* First-time hint — small, dismissible-feeling info banner. */}
      {rows.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-hairline bg-accent/5 px-3.5 py-2.5 text-[13px] text-graphite">
          <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v.5a.75.75 0 0 0 1.5 0v-.5ZM10 9a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 9Z" clipRule="evenodd" />
          </svg>
          <div>
            <span className="font-medium text-ink">Tip.</span>{' '}
            Click any row to open the patient&apos;s full referral — patient details, the study, the appointment, and your notes are all on one page.
          </div>
        </div>
      )}

      <Filters
        query={query}
        status={status}
        modality={modality}
        onQuery={setQuery}
        onStatus={setStatus}
        onModality={setModality}
        count={filtered.length}
      />

      {filtered.length === 0 ? (
        rows.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No referrals yet"
              description="Send your first patient for imaging in under a minute."
              cta={{ href: '/refer', label: 'Create your first referral', icon: FilePlusIcon }}
            />
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              title="No matches"
              description="Try clearing filters or searching for something else."
            />
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline bg-paper">
          <div className="hidden grid-cols-[2.4fr_1.7fr_1.1fr_1.2fr_70px] gap-4 border-b border-hairline bg-bone px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-microcaps text-smoke md:grid">
            <div title="The patient this referral is for.">Patient</div>
            <div title="What kind of imaging study was ordered.">Study</div>
            <div title="Where this referral stands right now.">Status</div>
            <div title="The booked appointment, or when the referral last changed.">When</div>
            <div></div>
          </div>
          <ul className="divide-y divide-hairline">
            {filtered.map((r) => {
              const sr = r.serviceRequest;
              const code = modalityCode(sr);
              const updated = sr.meta?.lastUpdated;
              const apptTime = r.appointment?.start;
              const reason = reasonText(sr);
              const isScheduled = r.appointment?.status === 'booked';
              const fullName = `${r.patient?.name?.[0]?.given?.[0] ?? ''} ${r.patient?.name?.[0]?.family ?? ''}`.trim() || 'Unknown patient';
              const goToDetail = () => router.push(`/refer/${sr.id}`);
              return (
                <li
                  key={sr.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`View referral for ${fullName} — ${sr.code?.text ?? code ?? 'study'}`}
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
                  <div className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-[2.4fr_1.7fr_1.1fr_1.2fr_70px] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <PatientCell patient={r.patient} />
                      {reason && (
                        <div className="ml-[44px] mt-1.5 hidden truncate text-[12.5px] leading-snug text-smoke md:block">
                          <span className="text-graphite">Reason:</span> {reason}
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ModalityBadge code={code} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-medium tracking-tightish text-ink" title={sr.code?.text ?? code ?? ''}>
                          {sr.code?.text ?? code ?? '—'}
                        </div>
                        {!apptTime && (
                          <div className="truncate text-[12px] text-smoke md:hidden">{reason}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col items-start gap-1">
                      {sr.status === 'revoked' || sr.status === 'on-hold' ? (
                        <StatusBadge status={sr.status} />
                      ) : (
                        <StatusBadge stage={deriveStage({ sr, ...(r.appointment ? { appointment: r.appointment } : {}) })} />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col leading-tight">
                      {apptTime ? (
                        <>
                          <span className="truncate text-[13px] font-medium text-ink tabular">
                            {formatDateTime(apptTime)}
                          </span>
                          <span className="mt-0.5 text-[11.5px] text-smoke">Appointment date</span>
                        </>
                      ) : (
                        <>
                          <span className="truncate text-[13px] text-graphite">{timeAgo(updated)}</span>
                          <span className="mt-0.5 text-[11.5px] text-smoke">Last update</span>
                        </>
                      )}
                    </div>
                    {/* Hover hint — appears only when row is hovered/focused. */}
                    <div className="hidden items-center justify-end gap-1 text-smoke md:flex">
                      <span className="text-[11.5px] font-medium opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
                        View
                      </span>
                      <ChevronRightIcon className="h-4 w-4 transition group-hover:text-ink" />
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
