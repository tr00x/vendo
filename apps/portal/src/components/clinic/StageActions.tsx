'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { SlotSummary } from '@/components/wizard/CalendarPicker';
import { formatDayTime } from '@/lib/format';
import {
  CalendarIcon,
  CheckCircleIcon,
  XIcon,
  PhoneIcon,
  AlertCircleIcon,
} from '@/components/ui/icons';
import { ScheduleModal } from './ScheduleModal';
import {
  scheduleAppointmentAction,
  rescheduleAppointmentAction,
  cancelReferralAction,
  completeReferralAction,
  closeReferralAction,
  attachImagingLinkAction,
  markNoShowAction,
} from './actions';
import type { Stage } from '@/lib/stage';

interface Props {
  serviceRequestId: string;
  appointmentId?: string | undefined;
  appointmentStart?: string | undefined;
  stage: Stage;
  freeSlots: SlotSummary[];
  pacsLinkAlreadySet: boolean;
}

export function StageActions({
  serviceRequestId,
  appointmentId,
  appointmentStart,
  stage,
  freeSlots,
  pacsLinkAlreadySet,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [pacsLink, setPacsLink] = useState('');
  const [showPacsInput, setShowPacsInput] = useState(false);

  async function run<T extends { ok: boolean; error?: string }>(label: string, fn: () => Promise<T>, ok: string) {
    setBusy(label);
    const r = await fn();
    setBusy(null);
    if (r.ok) {
      toast.success(ok);
      router.refresh();
      return true;
    }
    toast.error('Action failed', { description: r.error });
    return false;
  }

  // Stage: closed (cancelled or fully delivered)
  if (stage === 'closed') {
    return (
      <div className="rounded-md border border-hairline bg-bone p-4">
        <div className="flex items-center gap-2 text-[13.5px] font-medium text-graphite">
          <CheckCircleIcon className="h-4 w-4 text-smoke" />
          Closed — no action needed.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-md border border-hairline bg-paper">
        <header className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div>
            <h2 className="text-[14px] font-semibold tracking-tightish text-ink">Next step</h2>
            <p className="mt-0.5 text-[12.5px] text-smoke">
              {stage === 'submitted' && 'New referral. Schedule the appointment.'}
              {stage === 'triaged' && 'In triage. Schedule when ready.'}
              {stage === 'scheduled' && 'Appointment booked. Mark imaging done after the study.'}
              {stage === 'completed' && 'Imaging captured. Attach the report and close out.'}
            </p>
          </div>
        </header>

        <div className="p-5 space-y-3">
          {/* Primary based on stage */}
          {(stage === 'submitted' || stage === 'triaged') && !appointmentId && (
            <PrimaryAction
              icon={CalendarIcon}
              title="Schedule appointment"
              description={`Pick a slot from ${freeSlots.length} available times. Patient + referrer get an email.`}
              cta="Open calendar"
              onClick={() => setScheduleOpen(true)}
              busy={busy === 'schedule'}
            />
          )}

          {stage === 'scheduled' && appointmentId && (
            <>
              <PrimaryAction
                icon={CheckCircleIcon}
                title={pacsLinkAlreadySet ? 'Mark complete' : 'Imaging done — attach study'}
                description={
                  showPacsInput
                    ? 'Paste the PACS deeplink so the doctor can view the study.'
                    : 'Add a PACS link, then close the loop with the referrer.'
                }
                cta={showPacsInput ? (pacsLink ? 'Save link & complete' : 'Skip link & complete') : 'Mark imaging done'}
                onClick={async () => {
                  if (!showPacsInput && !pacsLinkAlreadySet) {
                    setShowPacsInput(true);
                    return;
                  }
                  if (pacsLink.trim()) {
                    const ok = await run('attach', () => attachImagingLinkAction(serviceRequestId, pacsLink.trim()), 'PACS link saved');
                    if (!ok) return;
                  }
                  await run('complete', () => completeReferralAction(serviceRequestId), 'Marked complete — referrer notified');
                  setShowPacsInput(false);
                  setPacsLink('');
                }}
                busy={busy === 'attach' || busy === 'complete'}
              >
                {showPacsInput && (
                  <div className="mt-2">
                    <input
                      value={pacsLink}
                      onChange={(e) => setPacsLink(e.target.value)}
                      placeholder="https://pacs.minipacs.example/study/abc123"
                      className="input"
                    />
                    <p className="help">
                      Tip: paste a guest-share link from your minipacs / PACS viewer. Leave empty to skip.
                    </p>
                  </div>
                )}
              </PrimaryAction>

              {/* Secondary: reschedule + no-show + send reminder */}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleOpen(true)}
                  className="btn-secondary"
                >
                  <CalendarIcon className="h-4 w-4" /> Reschedule
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!appointmentId) return;
                    if (
                      !window.confirm(
                        'Mark this patient as a no-show? The slot will be freed and the referring doctor will be notified.',
                      )
                    ) {
                      return;
                    }
                    await run(
                      'noshow',
                      () => markNoShowAction(serviceRequestId, appointmentId),
                      'Marked no-show — slot freed, doctor notified',
                    );
                  }}
                  disabled={busy === 'noshow'}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-signal-stop/30 bg-paper px-3.5 py-2 text-[13px] font-medium text-signal-stop transition hover:bg-signal-stop/5 disabled:opacity-50"
                >
                  <AlertCircleIcon className="h-4 w-4" /> Mark no-show
                </button>
                <button
                  type="button"
                  onClick={() => toast.info('Reminder email queued (stub — wire to bot in phase 2)')}
                  className="btn-secondary"
                >
                  <PhoneIcon className="h-4 w-4" /> Send reminder
                </button>
              </div>
            </>
          )}

          {stage === 'completed' && (
            <>
              <PrimaryAction
                icon={CheckCircleIcon}
                title={pacsLinkAlreadySet ? 'Close referral' : 'Attach report & close'}
                description="Verify the study link, then close out the referral."
                cta="Close referral"
                onClick={async () => {
                  if (pacsLink.trim()) {
                    const ok = await run('attach', () => attachImagingLinkAction(serviceRequestId, pacsLink.trim()), 'PACS link saved');
                    if (!ok) return;
                  }
                  await run('close', () => closeReferralAction(serviceRequestId), 'Referral closed — referrer notified');
                }}
                busy={busy === 'close' || busy === 'attach'}
              />
              {!pacsLinkAlreadySet && (
                <div className="pt-2">
                  <input
                    value={pacsLink}
                    onChange={(e) => setPacsLink(e.target.value)}
                    placeholder="https://pacs.minipacs.example/study/abc123"
                    className="input"
                  />
                  <p className="help">Adds a guest-share link to the referrer&apos;s detail page.</p>
                </div>
              )}
            </>
          )}

          {/* Cancel — always available unless closed */}
          <div className="flex items-center justify-between gap-2 border-t border-hairline pt-3 mt-2">
            <span className="text-[12px] text-smoke">Need to cancel this referral?</span>
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="text-[12.5px] font-medium text-signal-stop hover:underline"
            >
              Cancel referral
            </button>
          </div>

          {appointmentStart && (
            <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-bone px-3 py-2 text-[12.5px] text-graphite">
              <CalendarIcon className="h-3.5 w-3.5 text-smoke" />
              Booked for{' '}
              <strong className="font-semibold text-ink">{formatDayTime(appointmentStart)}</strong>
            </div>
          )}
        </div>
      </div>

      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule appointment"
        slots={freeSlots}
        onConfirm={async (slot) => {
          await run('schedule', () => scheduleAppointmentAction(serviceRequestId, slot.id), 'Appointment scheduled — referrer + patient notified');
          setScheduleOpen(false);
        }}
      />

      <ScheduleModal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Reschedule appointment"
        slots={freeSlots}
        requireReason
        onConfirm={async (slot, reason) => {
          if (!appointmentId) return;
          await run(
            'reschedule',
            () => rescheduleAppointmentAction(appointmentId, slot.id, reason),
            'Rescheduled — both parties notified',
          );
          setRescheduleOpen(false);
        }}
      />

      {cancelOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-cta/40 p-4 animate-fade-in backdrop-blur-sm"
          onClick={() => setCancelOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-md border border-hairline bg-paper p-6 shadow-xl animate-slide-up"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-signal-stop/10 text-signal-stop">
                <XIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[15.5px] font-semibold tracking-tightish text-ink">
                  Cancel this referral?
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-smoke">
                  This is permanent. The doctor and patient (if email on file) will be notified by email. Any booked appointment will be freed up.
                </p>
              </div>
            </div>
            <label className="mt-5 block">
              <span className="label">
                Reason <span className="font-normal text-smoke">(visible in audit log and to the doctor)</span>
              </span>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Patient cancelled by phone, no longer needs imaging."
                rows={3}
                className="input resize-none"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2 border-t border-hairline pt-4">
              <button type="button" onClick={() => setCancelOpen(false)} className="btn-secondary">
                Keep it active
              </button>
              <button
                type="button"
                onClick={async () => {
                  await run('cancel', () => cancelReferralAction(serviceRequestId, cancelReason.trim() || 'Cancelled by clinic'), 'Cancelled — referrer and patient notified');
                  setCancelOpen(false);
                }}
                className="inline-flex items-center justify-center rounded-md bg-signal-stop px-4 py-2 text-[13px] font-medium text-white transition hover:bg-signal-stop/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Yes, cancel referral
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PrimaryAction({
  icon: Icon,
  title,
  description,
  cta,
  onClick,
  busy,
  children,
}: {
  icon: (p: { className?: string }) => React.ReactNode;
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
  busy: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-ink bg-bone p-4 shadow-[inset_0_0_0_1px_var(--ink)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-cta text-white">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold tracking-tightish text-ink">{title}</div>
          <div className="mt-0.5 text-[12.5px] text-graphite">{description}</div>
          {children}
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className="btn-primary self-start flex-shrink-0 disabled:opacity-50"
        >
          {busy ? 'Working…' : cta}
        </button>
      </div>
    </div>
  );
}
