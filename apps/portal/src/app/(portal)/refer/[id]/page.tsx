import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Appointment, DocumentReference, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { requireSession } from '@/lib/auth/guard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ModalityBadge } from '@/components/dashboard/ModalityBadge';
import { PatientAvatar } from '@/components/dashboard/PatientAvatar';
import { StagePipeline } from '@/components/shared/StagePipeline';
import { ActivityTimeline, authorRefIdsFromSr } from '@/components/shared/ActivityTimeline';
import { CommentComposer } from '@/components/shared/CommentComposer';
import { ReferrerActions } from '@/components/portal/ReferrerActions';
import { addReferrerCommentAction } from '@/components/portal/actions';
import { BRAND } from '@/lib/branding';
import {
  ArrowLeftIcon,
  CalendarIcon,
  PhoneIcon,
  MailIcon,
  FileIcon,
  AlertCircleIcon,
} from '@/components/ui/icons';
import { ageFromDOB, formatDateTime, modalityMeta, timeAgo } from '@/lib/format';
import { deriveStage, hasPacsLink, pacsLinkOf } from '@/lib/stage';
import { loadPractitionerRoles } from '@/lib/practitioner-roles';

interface PageProps { params: Promise<{ id: string }> }

function safeUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.replace(/[.,);\]]+$/, '');
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { outcome?: { issue?: Array<{ code?: string }> }; status?: number };
  return e?.outcome?.issue?.[0]?.code === 'not-found' || e?.status === 404;
}

function reasonText(sr: ServiceRequest): { text: string; code: string | undefined } {
  const r = sr.reasonCode?.[0];
  return {
    text: r?.text ?? r?.coding?.[0]?.display ?? '',
    code: r?.coding?.find((c) => c.system === 'http://hl7.org/fhir/sid/icd-10-cm')?.code,
  };
}

function getInsurance(sr: ServiceRequest) {
  const ext = sr.extension?.find((x) => x.url === 'http://vendo.local/ext/insurance');
  if (!ext?.extension) return undefined;
  const get = (url: string) => ext.extension!.find((e) => e.url === url)?.valueString;
  return { payor: get('payor'), memberId: get('memberId'), groupNumber: get('groupNumber') };
}

/** Extract cancellation context from the most recent matching note.
 *  Used only when sr.status === 'revoked'. */
function getCancellation(sr: ServiceRequest): { reason: string; time: string | undefined; by: 'you' | 'clinic' | 'someone' } | undefined {
  if (sr.status !== 'revoked') return undefined;
  const notes = sr.note ?? [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    const t = (n.text ?? '').trim();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^Withdrawn by referrer:\s*([\s\S]*)$/i))) {
      return { reason: (m[1] ?? '').trim(), time: n.time, by: 'you' };
    }
    if ((m = t.match(/^Cancelled by clinic:\s*([\s\S]*)$/i))) {
      return { reason: (m[1] ?? '').trim(), time: n.time, by: 'clinic' };
    }
  }
  return { reason: '', time: sr.meta?.lastUpdated, by: 'someone' };
}

/** Latest clinic-authored note text — used when status is 'on-hold' to surface
 *  whatever question or blocker the clinic posted. Anonymous on the server
 *  side; the timeline below still attributes it. */
function latestClinicNote(sr: ServiceRequest, roles: Map<string, { role: string }>): string | undefined {
  const notes = sr.note ?? [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    const ref = (n as { authorReference?: { reference?: string } }).authorReference?.reference;
    const id = ref?.split('/')[1];
    const role = id ? roles.get(id)?.role : undefined;
    if (role === 'ClinicStaff' && n.text) {
      // Skip system-y prefixes and PACS link notes — those aren't questions.
      const t = n.text.trim();
      if (/^Images available:/i.test(t)) continue;
      return t;
    }
  }
  return undefined;
}

/** Use relative time for fresh entries (< 7 days), absolute for older.
 *  Doctors care about "just now" recency but want exact date for older cases. */
function smartDate(iso: string | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const days = (Date.now() - t) / 86_400_000;
  return days > 7 ? formatDateTime(iso) : timeAgo(iso);
}

function SectionCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-hairline bg-paper">
      <header className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-3">
        <div>
          <h2 className="text-[14px] font-semibold tracking-tightish text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-[12.5px] text-smoke">{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Plain-English explanation of the current stage and what to expect next.
 *  Sits below the StagePipeline to demystify the icons for non-tech users. */
function NextStepCallout({ stage }: { stage: import('@/lib/stage').Stage }) {
  const COPY: Record<string, { now: string; next: string }> = {
    submitted: {
      now: 'The clinic has your referral.',
      next: "They'll review insurance and reach out to your patient. Usually 1 business day.",
    },
    triaged: {
      now: 'The clinic is preparing your patient.',
      next: 'They are checking insurance and calling your patient to schedule the appointment.',
    },
    scheduled: {
      now: 'Your patient has a confirmed appointment.',
      next: 'After the imaging is done, you\'ll see a link to view the images right here.',
    },
    completed: {
      now: 'Imaging is done.',
      next: "The radiologist is reading the images and writing a report. You'll get the report when it's ready.",
    },
    closed: {
      now: 'This referral is complete.',
      next: 'The report has been delivered. Anything attached is below.',
    },
  };
  const c = COPY[stage] ?? COPY.submitted!;
  return (
    <div className="mt-5 flex items-start gap-2.5 rounded-md border border-hairline bg-bone px-3.5 py-3 text-[13px]">
      <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v.5a.75.75 0 0 0 1.5 0v-.5ZM10 9a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 9Z" clipRule="evenodd" />
      </svg>
      <div>
        <span className="font-semibold text-ink">Right now: </span>
        <span className="text-graphite">{c.now}</span>{' '}
        <span className="font-semibold text-ink">What&apos;s next: </span>
        <span className="text-graphite">{c.next}</span>
      </div>
    </div>
  );
}

export default async function ReferralDetail({ params }: PageProps) {
  const { id } = await params;
  const { medplum } = await requireSession();

  let sr: ServiceRequest;
  try {
    sr = await medplum.readResource('ServiceRequest', id);
  } catch (err) {
    if (isNotFound(err)) notFound();
    throw err;
  }
  const patientId = sr.subject?.reference?.split('/')[1];
  let patient: Patient | undefined;
  if (patientId) { try { patient = await medplum.readResource('Patient', patientId); } catch {} }
  const appts: Appointment[] = await medplum
    .searchResources('Appointment', `based-on=ServiceRequest/${id}`)
    .catch(() => []);
  const docs: DocumentReference[] = await medplum
    .searchResources('DocumentReference', `related=ServiceRequest/${id}`)
    .catch(() => []);

  const reason = reasonText(sr);
  const insurance = getInsurance(sr);
  const modality = sr.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code;
  const m = modalityMeta(modality);
  const age = ageFromDOB(patient?.birthDate);
  const phone = patient?.telecom?.find((t) => t.system === 'phone')?.value;
  const email = patient?.telecom?.find((t) => t.system === 'email')?.value;
  // Pick the most relevant active appointment — same rank ordering as the
  // dashboard so a no-show doesn't shadow the absence of a real booking.
  const APPT_RANK: Record<string, number> = { booked: 4, pending: 3, proposed: 2, fulfilled: 1 };
  const appt = [...appts].sort(
    (x, y) => (APPT_RANK[y.status ?? ''] ?? 0) - (APPT_RANK[x.status ?? ''] ?? 0),
  ).find((a) => (APPT_RANK[a.status ?? ''] ?? 0) > 0);
  const cancelled = sr.status === 'revoked';
  const stage = deriveStage({ sr, ...(appt ? { appointment: appt } : {}) });
  const linkSet = hasPacsLink(sr);
  const imageUrlSafe = safeUrl(pacsLinkOf(sr));

  const noteAuthorIds = authorRefIdsFromSr(sr);
  const practitionerRoles = await loadPractitionerRoles(medplum, noteAuthorIds);

  const fullPatientName =
    `${patient?.name?.[0]?.given?.[0] ?? ''} ${patient?.name?.[0]?.family ?? ''}`.trim() ||
    'Unknown patient';
  const bodyPart = sr.code?.text?.split('—')[1]?.trim();

  const cancellation = getCancellation(sr);
  const isOnHold = sr.status === 'on-hold';
  const clinicQuestion = isOnHold ? latestClinicNote(sr, practitionerRoles) : undefined;
  const hasInsurance = !!(insurance && (insurance.payor || insurance.memberId));

  return (
    <div>
      {/* Breadcrumb back link */}
      <div className="mb-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 -ml-1 rounded-md px-2 py-1 text-[13px] font-medium text-smoke transition hover:bg-hairline/50 hover:text-ink"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Dashboard
        </Link>
      </div>

      {/* Page masthead */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <ModalityBadge code={modality} size="md" />
          <div>
            <h1 className="text-[26px] font-semibold tracking-tightish leading-tight text-ink">
              {sr.code?.text ?? `${m.label} study`}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-smoke">
              <span title={`Sent ${formatDateTime(sr.meta?.lastUpdated)}`}>
                Sent {smartDate(sr.meta?.lastUpdated)}
              </span>
              <span aria-hidden className="text-ash">·</span>
              <span title="Patient name">For <span className="text-ink">{fullPatientName}</span></span>
              <span aria-hidden className="text-ash">·</span>
              <span title="Reference code — give this to the clinic if you call them">
                Ref{' '}
                <span className="font-mono text-[12px] text-graphite">
                  #{(sr.id ?? '').slice(0, 8)}
                </span>
              </span>
            </div>
          </div>
        </div>
        <StatusBadge status={sr.status} size="md" />
      </div>

      {/* Cancellation banner — prominent so the user instantly knows the SR
          is dead and can see who killed it and why. */}
      {cancellation && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-signal-stop/25 bg-signal-stop/5 px-5 py-4">
          <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-signal-stop text-white">
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold tracking-tightish text-ink">
              This referral was cancelled
              {cancellation.by === 'you' && ' by you'}
              {cancellation.by === 'clinic' && ' by the clinic'}
              {cancellation.time && (
                <span className="font-normal text-graphite">
                  {' · '}{smartDate(cancellation.time)}
                </span>
              )}
            </div>
            {cancellation.reason && (
              <div className="mt-1 text-[13px] leading-relaxed text-graphite">
                <span className="text-smoke">Reason:</span>{' '}
                <span className="whitespace-pre-wrap">{cancellation.reason}</span>
              </div>
            )}
            <div className="mt-1.5 text-[12.5px] text-smoke">
              No further action will be taken. To re-order, send a new referral from the dashboard.
            </div>
          </div>
        </div>
      )}

      {/* On-hold call-to-action — surface the clinic's blocker so the doctor
          knows the ball is in their court. */}
      {isOnHold && !cancellation && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-orange-300 bg-orange-50 px-5 py-4">
          <AlertCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-700" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold tracking-tightish text-orange-900">
              The clinic is waiting on you
            </div>
            <div className="mt-1 text-[13px] leading-relaxed text-orange-900/85">
              This referral is on hold. The clinic posted{' '}
              {clinicQuestion ? 'a question or note' : 'something that needs your attention'} —
              read the latest message below and reply, or call them directly.
            </div>
            {clinicQuestion && (
              <div className="mt-2.5 rounded border border-orange-200 bg-paper px-3 py-2 text-[13px] italic leading-relaxed text-graphite">
                “{clinicQuestion.length > 280 ? `${clinicQuestion.slice(0, 280)}…` : clinicQuestion}”
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage pipeline — what's happening + what's next, in plain English */}
      <section className="mb-6 rounded-md border border-hairline bg-paper p-5">
        <div className="mb-3.5 flex items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-semibold tracking-tightish text-ink">
            Where things stand
          </h2>
          <span className="hidden text-[12px] text-smoke sm:inline">
            5 steps from sent to report delivered
          </span>
        </div>
        <StagePipeline stage={stage} cancelled={cancelled} />
        {!cancelled && <NextStepCallout stage={stage} />}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {!cancelled && <ReferrerActions serviceRequestId={sr.id!} />}

          {/* PACS link CTA — clean ink card with a plain-English caption */}
          {imageUrlSafe && linkSet && (
            <a
              href={imageUrlSafe}
              target="_blank"
              rel="noopener noreferrer"
              title="Click to open the actual MRI/X-Ray/Ultrasound images in the imaging viewer"
              className="group block overflow-hidden rounded-md border border-ink bg-cta p-5 text-white transition hover:bg-graphite"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-microcaps text-white/60">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                    Images ready
                  </div>
                  <div className="mt-1.5 text-[17px] font-semibold tracking-tightish">
                    View study images →
                  </div>
                  <div className="mt-1 text-[12.5px] text-white/70">
                    Opens the imaging viewer in a new browser tab. You can scroll through the slices and download them.
                  </div>
                </div>
                <FileIcon className="h-10 w-10 text-white/60 transition group-hover:text-white/90" />
              </div>
            </a>
          )}

          {/* Patient */}
          <SectionCard
            title="Patient"
            hint="Who this referral is for. The clinic uses this to reach out and book the appointment."
          >
            <div className="flex items-start gap-4 p-5">
              <PatientAvatar patient={patient} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold tracking-tightish text-ink">
                  {fullPatientName}
                </div>
                <div className="mt-0.5 text-[13.5px] text-smoke">
                  {age != null && `${age} years old`}
                  {patient?.gender && patient.gender !== 'unknown' && (
                    <> · {patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1)}</>
                  )}
                  {patient?.birthDate && <> · Born {patient.birthDate}</>}
                </div>

                {(phone || email) && (
                  <div className="mt-3.5">
                    <div className="mb-1.5 text-[11px] font-medium uppercase tracking-microcaps text-smoke">
                      Contact info — used by the clinic to reach the patient
                    </div>
                    <div className="flex flex-wrap gap-2 text-[13.5px]">
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          title="Click to call this patient on your phone"
                          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-bone px-3 py-1.5 text-graphite transition hover:border-ink/30 hover:text-ink"
                        >
                          <PhoneIcon className="h-3.5 w-3.5 text-smoke" />
                          {phone}
                        </a>
                      )}
                      {email && (
                        <a
                          href={`mailto:${email}`}
                          title="Click to email this patient"
                          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-bone px-3 py-1.5 text-graphite transition hover:border-ink/30 hover:text-ink"
                        >
                          <MailIcon className="h-3.5 w-3.5 text-smoke" />
                          {email}
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {!phone && !email && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                    <span className="font-semibold">Heads up:</span> no phone or email on file. The clinic may not be able to reach this patient — call them with new contact info if you have it.
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Study request */}
          <SectionCard
            title="What you ordered"
            hint="The imaging study you asked the clinic to perform on this patient."
          >
            <dl className="grid grid-cols-1 gap-y-5 p-5 sm:grid-cols-3 sm:gap-x-6">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-microcaps text-smoke" title="The type of imaging — like MRI, X-Ray, or Ultrasound">
                  Type of study
                </dt>
                <dd className="mt-1 text-[14.5px] font-semibold tracking-tightish text-ink">
                  {m.label}
                </dd>
                <dd className="mt-0.5 text-[12px] text-smoke">{m.description}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-medium uppercase tracking-microcaps text-smoke" title="Which part of the body the imaging covers">
                  Body part
                </dt>
                <dd className="mt-1 text-[14.5px] font-semibold tracking-tightish text-ink">
                  {bodyPart || <span className="font-normal italic text-smoke">Not specified</span>}
                </dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="text-[11px] font-medium uppercase tracking-microcaps text-smoke" title="Why you ordered this study — symptoms, suspected diagnosis, etc.">
                  Why you ordered it
                </dt>
                <dd className="mt-1.5 flex flex-wrap items-baseline gap-2 text-[14px]">
                  {reason.code && (
                    <span
                      title="Standardized diagnosis code (ICD-10) — used for billing and clinical record-keeping"
                      className="inline-flex items-center gap-1 rounded border border-hairline bg-bone px-2 py-0.5 text-[11.5px] font-medium text-graphite"
                    >
                      <span className="text-[10px] font-normal uppercase tracking-microcaps text-smoke">ICD-10</span>
                      <span className="font-mono">{reason.code}</span>
                    </span>
                  )}
                  <span className="text-ink">
                    {reason.text || <span className="italic text-smoke">No reason recorded</span>}
                  </span>
                </dd>
              </div>
            </dl>
          </SectionCard>

          {/* Attached documents — placeholder if empty so users know what
              eventually shows up here. */}
          {docs.length === 0 ? (
            <div className="flex items-start gap-3 rounded-md border border-dashed border-hairline bg-paper px-5 py-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-bone text-smoke">
                <FileIcon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[13.5px] font-semibold tracking-tightish text-ink">
                  No documents yet
                </div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-smoke">
                  When the clinic uploads documents — consent forms, prep instructions, or the radiologist&apos;s report PDF — they will appear here.
                </div>
              </div>
            </div>
          ) : (
            <SectionCard
              title={`Attached documents (${docs.length})`}
              hint="Files attached to this referral."
            >
              <ul className="divide-y divide-hairline">
                {docs.map((d) => {
                  const a = d.content?.[0]?.attachment;
                  return (
                    <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-bone text-smoke">
                        <FileIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-medium tracking-tightish text-ink">
                          {a?.title ?? 'Document'}
                        </div>
                        <div className="text-[11.5px] text-smoke">
                          {a?.contentType ?? 'unknown type'}
                        </div>
                      </div>
                      {a?.url && (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary !py-1 !px-3 !text-[12px]"
                        >
                          Open
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}
        </div>

        <aside className="space-y-5">
          {/* Appointment */}
          {appt && appt.start ? (
            <SectionCard
              title="Appointment"
              hint="When your patient is scheduled to come in for the imaging."
            >
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <CalendarIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold tracking-tightish text-ink tabular">
                      {formatDateTime(appt.start)}
                    </div>
                    <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12px]">
                      {appt.status === 'booked' ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                          <span className="font-medium text-emerald-700">Confirmed</span>
                          <span className="text-smoke">— patient is booked</span>
                        </>
                      ) : appt.status === 'pending' || appt.status === 'proposed' ? (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                          <span className="font-medium text-amber-800">Awaiting confirmation</span>
                          <span className="text-smoke">— clinic still working on it</span>
                        </>
                      ) : (
                        <span className="text-smoke">Status: {appt.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : (
            !cancelled && (
              <div className="flex items-start gap-3 rounded-md border border-dashed border-hairline bg-paper px-5 py-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-bone text-smoke">
                  <CalendarIcon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[13.5px] font-semibold tracking-tightish text-ink">
                    No appointment yet
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-smoke">
                    Once the clinic books your patient, the date and time will appear here.
                  </div>
                </div>
              </div>
            )
          )}

          {/* Insurance */}
          {!hasInsurance && !cancelled && (
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-5 py-4">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
              <div>
                <div className="text-[13.5px] font-semibold tracking-tightish text-amber-900">
                  No insurance on file
                </div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-amber-900/85">
                  The clinic may need to call your patient to collect insurance info before they can schedule. If you have it, message the clinic below or call them.
                </div>
              </div>
            </div>
          )}
          {hasInsurance && (
            <SectionCard
              title="Insurance"
              hint="What the patient gave you — the clinic uses this to bill the visit."
            >
              <div className="p-5">
                <div className="text-[11px] font-medium uppercase tracking-microcaps text-smoke">
                  Insurance company
                </div>
                <div className="mt-0.5 text-[15px] font-semibold tracking-tightish text-ink">
                  {insurance.payor || <span className="font-normal italic text-smoke">—</span>}
                </div>
                <dl className="mt-4 space-y-2 border-t border-hairline pt-3 text-[13px]">
                  {insurance.memberId && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt
                        className="text-smoke"
                        title="The number printed on the patient's insurance card — identifies them to the insurance company"
                      >
                        Member ID
                      </dt>
                      <dd className="font-mono text-[12.5px] tracking-tightish text-ink">
                        {insurance.memberId}
                      </dd>
                    </div>
                  )}
                  {insurance.groupNumber && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt
                        className="text-smoke"
                        title="The group number on the insurance card — usually the patient's employer plan ID"
                      >
                        Group number
                      </dt>
                      <dd className="font-mono text-[12.5px] tracking-tightish text-ink">
                        {insurance.groupNumber}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </SectionCard>
          )}

          {/* Messages & activity */}
          <SectionCard
            title="Messages & history"
            hint="Send a question to the clinic, or read what they post back. Everything is logged here so nothing gets lost."
          >
            <div className="space-y-4 p-5">
              {cancelled ? (
                <div className="rounded-md border border-hairline bg-bone px-3.5 py-2.5 text-[12.5px] text-smoke">
                  This referral is cancelled — no new messages can be sent. The history below stays for your records.
                </div>
              ) : (
                <CommentComposer
                  serviceRequestId={sr.id!}
                  action={addReferrerCommentAction}
                  placeholder="Question for the clinic? Type here — they'll see it on their side too."
                  submitLabel="Send to clinic"
                  successMsg="Message sent"
                />
              )}
              <div className="border-t border-hairline pt-4">
                <div className="mb-2.5 text-[11px] font-medium uppercase tracking-microcaps text-smoke">
                  History — newest first
                </div>
                <ActivityTimeline
                  sr={sr}
                  practitionerRoles={practitionerRoles}
                  viewerRole="Referrer"
                />
              </div>
            </div>
          </SectionCard>

          {/* Help footer — call clinic for urgent changes */}
          {!cancelled && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2.5">
                <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
                <div>
                  <div className="text-[13px] font-semibold tracking-tightish text-amber-900">
                    Need to make a change?
                  </div>
                  <div className="mt-1 text-[12.5px] leading-relaxed text-amber-900/80">
                    For urgent changes — wrong patient, wrong study, or anything time-sensitive — call the clinic at{' '}
                    <a href={`tel:${BRAND.phoneTel}`} className="font-semibold underline underline-offset-2">
                      {BRAND.phone}
                    </a>
                    .
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
