import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Appointment, DocumentReference, Patient, Practitioner, ServiceRequest, Slot } from '@medplum/fhirtypes';
import { requireClinicStaff } from '@/lib/auth/guard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ModalityBadge } from '@/components/dashboard/ModalityBadge';
import { PatientAvatar } from '@/components/dashboard/PatientAvatar';
import { StagePipeline } from '@/components/shared/StagePipeline';
import { ActivityTimeline, authorRefIdsFromSr } from '@/components/shared/ActivityTimeline';
import { loadPractitionerRoles } from '@/lib/practitioner-roles';
import { CommentComposer } from '@/components/shared/CommentComposer';
import { StageActions } from '@/components/clinic/StageActions';
import { QuickFlags } from '@/components/clinic/QuickFlags';
import { addInternalNoteAction, addClinicPrivateNoteAction } from '@/components/clinic/actions';
import { QuickRebookButton } from '@/components/clinic/QuickRebookButton';
import {
  ArrowLeftIcon,
  PhoneIcon,
  MailIcon,
  FileIcon,
  AlertCircleIcon,
} from '@/components/ui/icons';
import { ageFromDOB, formatDateTime, modalityMeta, timeAgo } from '@/lib/format';
import { deriveStage, hasPacsLink, pacsLinkOf, readFlagsFromExt } from '@/lib/stage';
import { readAllergies } from '@/lib/fhir/allergies-extension';

interface PageProps { params: Promise<{ id: string }> }

function reasonInfo(sr: ServiceRequest): { text: string; code: string | undefined } {
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

function isNotFound(err: unknown): boolean {
  const e = err as { outcome?: { issue?: Array<{ code?: string }> }; status?: number };
  return e?.outcome?.issue?.[0]?.code === 'not-found' || e?.status === 404;
}

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

export default async function ClinicReferralDetail({ params }: PageProps) {
  const { id } = await params;
  const { medplum } = await requireClinicStaff();

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
  const requesterId = sr.requester?.reference?.split('/')[1];
  let requester: Practitioner | undefined;
  if (requesterId) { try { requester = await medplum.readResource('Practitioner', requesterId); } catch {} }
  const appts: Appointment[] = await medplum
    .searchResources('Appointment', `based-on=ServiceRequest/${id}`)
    .catch(() => []);
  const docs: DocumentReference[] = await medplum
    .searchResources('DocumentReference', `related=ServiceRequest/${id}`)
    .catch(() => []);

  const reason = reasonInfo(sr);
  const insurance = getInsurance(sr);
  const modality = sr.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code;
  const m = modalityMeta(modality);
  const age = ageFromDOB(patient?.birthDate);
  const phone = patient?.telecom?.find((t) => t.system === 'phone')?.value;
  const email = patient?.telecom?.find((t) => t.system === 'email')?.value;
  const requesterEmail = requester?.telecom?.find((t) => t.system === 'email')?.value;
  // Pick the most relevant active appointment — booked > pending > proposed
  // > fulfilled. A no-show or cancelled appointment must not shadow the
  // absence of a real booking.
  const APPT_RANK: Record<string, number> = { booked: 4, pending: 3, proposed: 2, fulfilled: 1 };
  const appt = [...appts].sort(
    (x, y) => (APPT_RANK[y.status ?? ''] ?? 0) - (APPT_RANK[x.status ?? ''] ?? 0),
  ).find((a) => (APPT_RANK[a.status ?? ''] ?? 0) > 0);
  // Most recent no-show — used to surface "Quick-rebook same time" CTA so
  // staff doesn't have to redo the slot picker manually.
  const lastNoShow = [...appts]
    .filter((a) => a.status === 'noshow' && a.start)
    .sort((x, y) => (y.start ?? '').localeCompare(x.start ?? ''))[0];

  let freeSlots: { id: string; start: string; end: string }[] = [];
  if (modality) {
    try {
      const sched = await medplum.searchResources(
        'Schedule',
        `service-category=http://vendo.local/study|${modality}&_count=1`,
      );
      const schedule = sched[0];
      if (schedule?.id) {
        const nowISO = new Date().toISOString();
        const slots: Slot[] = await medplum.searchResources(
          'Slot',
          `schedule=Schedule/${schedule.id}&status=free&start=ge${nowISO}&_count=400&_sort=start`,
        );
        freeSlots = slots
          .filter((s) => s.id && s.start && s.end)
          .map((s) => ({ id: s.id!, start: s.start!, end: s.end! }));
      }
    } catch {}
  }

  const stage = deriveStage({ sr, ...(appt ? { appointment: appt } : {}) });
  const cancelled = sr.status === 'revoked';
  const flags = readFlagsFromExt(sr.extension);
  const pacsLink = pacsLinkOf(sr);
  const linkSet = hasPacsLink(sr);
  const allergies = readAllergies(sr);
  const hasInsurance = !!(insurance && (insurance.payor || insurance.memberId));

  const noteAuthorIds = authorRefIdsFromSr(sr);
  if (requesterId) noteAuthorIds.add(requesterId);
  const practitionerRoles = await loadPractitionerRoles(medplum, noteAuthorIds);

  const patientFullName =
    `${patient?.name?.[0]?.given?.[0] ?? ''} ${patient?.name?.[0]?.family ?? ''}`.trim() || 'Unknown patient';
  const requesterFullName = requester
    ? `Dr ${requester.name?.[0]?.given?.[0] ?? ''} ${requester.name?.[0]?.family ?? ''}`.trim()
    : '—';
  const requesterInitials = requester?.name?.[0]
    ? `${(requester.name[0].given?.[0] ?? '?')[0]}${(requester.name[0].family ?? '?')[0]}`.toUpperCase()
    : '?';
  const bodyPart = sr.code?.text?.split('—')[1]?.trim();

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link
          href="/clinic/inbox"
          className="inline-flex items-center gap-1.5 -ml-1 rounded-md px-2 py-1 text-[13px] font-medium text-smoke transition hover:bg-hairline/50 hover:text-ink"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Inbox
        </Link>
      </div>

      {/* Masthead */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-4">
          <ModalityBadge code={modality} size="md" />
          <div>
            <h1 className="text-[26px] font-semibold tracking-tightish leading-tight text-ink">
              {sr.code?.text ?? `${m.label} study`}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-smoke">
              <span title={`Submitted ${formatDateTime(sr.meta?.lastUpdated)}`}>
                Received {smartDate(sr.meta?.lastUpdated)}
              </span>
              <span aria-hidden className="text-ash">·</span>
              <span title="Patient name">For <span className="text-ink">{patientFullName}</span></span>
              <span aria-hidden className="text-ash">·</span>
              <span title="Reference code — give this to a caller if they ask">
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

      {/* Allergy banner — restyled. Sits above the stage pipeline so it can't
          be missed; renders only when the doctor reported allergens or
          flagged an IV-contrast reaction history. */}
      {allergies?.hasAlert && (
        <div
          className="mb-6 flex items-start gap-3 rounded-md border border-signal-stop/30 bg-signal-stop/5 px-5 py-4"
          role="alert"
        >
          <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-signal-stop text-white">
            <AlertCircleIcon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1 text-[13px] text-graphite">
            <div className="text-[11px] font-semibold uppercase tracking-microcaps text-signal-stop">
              Patient allergies
            </div>
            {allergies.text && (
              <div className="mt-1 leading-relaxed">
                <span className="font-medium text-ink">Reported:</span> {allergies.text}
              </div>
            )}
            {allergies.ivContrast === 'yes' && (
              <div className="mt-1 font-semibold text-ink">
                ⚠ Prior IV contrast reaction — confirm before administering gadolinium or iodinated contrast.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage pipeline */}
      <section className="mb-6 rounded-md border border-hairline bg-paper p-5">
        <div className="mb-3.5 flex items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-semibold tracking-tightish text-ink">Where things stand</h2>
          <span className="hidden text-[12px] text-smoke sm:inline">
            5 steps from intake to delivered
          </span>
        </div>
        <StagePipeline stage={stage} cancelled={cancelled} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {!cancelled && (
            <StageActions
              serviceRequestId={sr.id!}
              {...(appt?.id ? { appointmentId: appt.id } : {})}
              {...(appt?.start ? { appointmentStart: appt.start } : {})}
              stage={stage}
              freeSlots={freeSlots}
              pacsLinkAlreadySet={linkSet}
            />
          )}

          {!cancelled && lastNoShow && !appt && lastNoShow.start && (
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-5 py-4">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold tracking-tightish text-amber-900">
                  Last appointment was a no-show
                </div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-amber-900/85">
                  {formatDateTime(lastNoShow.start)} — patient didn&apos;t show up. Try the same weekday + time next week:
                </div>
                <div className="mt-2.5">
                  <QuickRebookButton serviceRequestId={sr.id!} basisStart={lastNoShow.start} />
                </div>
              </div>
            </div>
          )}

          {!cancelled && (
            <SectionCard
              title="Quick flags"
              hint="Tap to mark — saved instantly. These advance the pipeline to 'In triage'."
            >
              <div className="p-5">
                <QuickFlags serviceRequestId={sr.id!} initial={flags} />
              </div>
            </SectionCard>
          )}

          {pacsLink && (
            <a
              href={pacsLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the imaging study in the PACS viewer"
              className="group block overflow-hidden rounded-md border border-ink bg-cta p-5 text-white transition hover:bg-graphite"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-microcaps text-white/60">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                    Images attached
                  </div>
                  <div className="mt-1.5 text-[17px] font-semibold tracking-tightish">
                    View study images →
                  </div>
                  <div className="mt-1 max-w-md truncate text-[12.5px] text-white/70">{pacsLink}</div>
                </div>
                <FileIcon className="h-10 w-10 flex-shrink-0 text-white/60 transition group-hover:text-white/90" />
              </div>
            </a>
          )}

          {/* Patient */}
          <SectionCard
            title="Patient"
            hint="Who this referral is for."
          >
            <div className="flex items-start gap-4 p-5">
              <PatientAvatar patient={patient} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold tracking-tightish text-ink">
                  {patientFullName}
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
                      Contact info
                    </div>
                    <div className="flex flex-wrap gap-2 text-[13.5px]">
                      {phone && (
                        <a
                          href={`tel:${phone}`}
                          title="Click to call"
                          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-bone px-3 py-1.5 text-graphite transition hover:border-ink/30 hover:text-ink"
                        >
                          <PhoneIcon className="h-3.5 w-3.5 text-smoke" />
                          {phone}
                        </a>
                      )}
                      {email && (
                        <a
                          href={`mailto:${email}`}
                          title="Click to email"
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
                    <span className="font-semibold">Heads up:</span> no phone or email on file. Ask the referring doctor for contact info before trying to schedule.
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Study request */}
          <SectionCard
            title="Study request"
            hint="What the doctor ordered."
          >
            <dl className="grid grid-cols-1 gap-y-5 p-5 sm:grid-cols-3 sm:gap-x-6">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-microcaps text-smoke">
                  Type of study
                </dt>
                <dd className="mt-1 text-[14.5px] font-semibold tracking-tightish text-ink">{m.label}</dd>
                <dd className="mt-0.5 text-[12px] text-smoke">{m.description}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-medium uppercase tracking-microcaps text-smoke">
                  Body part
                </dt>
                <dd className="mt-1 text-[14.5px] font-semibold tracking-tightish text-ink">
                  {bodyPart || <span className="font-normal italic text-smoke">Not specified</span>}
                </dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="text-[11px] font-medium uppercase tracking-microcaps text-smoke">
                  Reason from referrer
                </dt>
                <dd className="mt-1.5 flex flex-wrap items-baseline gap-2 text-[14px]">
                  {reason.code && (
                    <span
                      title="ICD-10 diagnosis code from the referring doctor"
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

          {/* Documents from referrer */}
          {docs.length > 0 ? (
            <SectionCard
              title={`From referrer (${docs.length})`}
              hint="Insurance card, prior films, prior reports — uploaded with the referral."
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
          ) : (
            <div className="flex items-start gap-3 rounded-md border border-dashed border-hairline bg-paper px-5 py-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-bone text-smoke">
                <FileIcon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[13.5px] font-semibold tracking-tightish text-ink">
                  No documents from the referrer
                </div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-smoke">
                  Insurance cards or prior films would appear here. If you need them, message the doctor below.
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          {/* Referring doctor */}
          {requester && (
            <SectionCard
              title="Referring doctor"
              hint="Who sent this referral."
            >
              <div className="p-5">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-bone text-[12px] font-semibold tracking-tightish text-graphite"
                    aria-hidden
                  >
                    {requesterInitials}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold tracking-tightish text-ink">
                      {requesterFullName}
                    </div>
                    <div className="truncate text-[12px] text-smoke">
                      {requester.qualification?.[0]?.code?.text ?? '—'}
                    </div>
                  </div>
                </div>
                {requesterEmail && (
                  <a
                    href={`mailto:${requesterEmail}`}
                    title="Email the referring doctor"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-hairline bg-bone px-3 py-1.5 text-[13px] text-graphite transition hover:border-ink/30 hover:text-ink"
                  >
                    <MailIcon className="h-3.5 w-3.5 text-smoke" />
                    {requesterEmail}
                  </a>
                )}
              </div>
            </SectionCard>
          )}

          {/* Insurance */}
          {hasInsurance ? (
            <SectionCard
              title="Insurance"
              hint="From the referrer — use for billing."
            >
              <div className="p-5">
                <div className="text-[11px] font-medium uppercase tracking-microcaps text-smoke">
                  Insurance company
                </div>
                <div className="mt-0.5 text-[15px] font-semibold tracking-tightish text-ink">
                  {insurance!.payor || <span className="font-normal italic text-smoke">—</span>}
                </div>
                <dl className="mt-4 space-y-2 border-t border-hairline pt-3 text-[13px]">
                  {insurance!.memberId && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-smoke">Member ID</dt>
                      <dd className="font-mono text-[12.5px] tracking-tightish text-ink">
                        {insurance!.memberId}
                      </dd>
                    </div>
                  )}
                  {insurance!.groupNumber && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-smoke">Group number</dt>
                      <dd className="font-mono text-[12.5px] tracking-tightish text-ink">
                        {insurance!.groupNumber}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </SectionCard>
          ) : (
            !cancelled && (
              <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-5 py-4">
                <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
                <div>
                  <div className="text-[13.5px] font-semibold tracking-tightish text-amber-900">
                    No insurance on file
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-amber-900/85">
                    Call the patient before scheduling — collect insurance, or note self-pay.
                  </div>
                </div>
              </div>
            )
          )}

          {/* Activity & notes */}
          <SectionCard
            title="Activity & notes"
            hint="Notes you post here are visible to the referrer too. Use 'Internal note' below for clinic-only context."
          >
            <div className="space-y-4 p-5">
              {!cancelled ? (
                <CommentComposer
                  serviceRequestId={sr.id!}
                  action={addInternalNoteAction}
                  placeholder="Add a clinic note (visible to the referrer too)…"
                  submitLabel="Post note"
                  successMsg="Note posted"
                />
              ) : (
                <div className="rounded-md border border-hairline bg-bone px-3.5 py-2.5 text-[12.5px] text-smoke">
                  This referral is cancelled — no new notes can be added. The history below stays for the record.
                </div>
              )}
              <div className="border-t border-hairline pt-4">
                <div className="mb-2.5 text-[11px] font-medium uppercase tracking-microcaps text-smoke">
                  History — newest first
                </div>
                <ActivityTimeline
                  sr={sr}
                  practitionerRoles={practitionerRoles}
                  viewerRole="ClinicStaff"
                />
              </div>
            </div>
          </SectionCard>

          {/* Internal-only clinic notes — separate composer with explicit
              "not visible to doctor" framing. Notes get an [Internal] prefix
              server-side and are filtered out of the referrer's timeline. */}
          {!cancelled && (
            <SectionCard
              title="Internal note"
              hint="Clinic-only — never shown to the doctor. For shift handoffs, phone-call summaries, internal flags."
            >
              <div className="p-5">
                <CommentComposer
                  serviceRequestId={sr.id!}
                  action={addClinicPrivateNoteAction}
                  placeholder="e.g. Called twice, no answer. Try again Mon AM."
                  submitLabel="Save internally"
                  successMsg="Internal note saved"
                />
                <p className="mt-2.5 text-[11.5px] leading-relaxed text-smoke">
                  These notes appear in the activity timeline above, marked with an <span className="rounded bg-amber-100 px-1 py-0 text-[9.5px] font-semibold uppercase tracking-microcaps text-amber-900">Internal</span> tag. Only clinic staff see them.
                </p>
              </div>
            </SectionCard>
          )}
        </aside>
      </div>
    </div>
  );
}
