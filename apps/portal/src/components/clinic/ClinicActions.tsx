'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircleIcon,
  XIcon,
  CalendarIcon,
  FileIcon,
  AlertCircleIcon,
} from '@/components/ui/icons';
import {
  confirmAppointmentAction,
  cancelReferralAction,
  completeReferralAction,
  attachImagingLinkAction,
} from './actions';

interface Props {
  serviceRequestId: string;
  appointmentId: string | undefined;
  status: string | undefined;
  isScheduled: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
}

export function ClinicActions({
  serviceRequestId,
  appointmentId,
  status,
  isScheduled,
  isCompleted,
  isCancelled,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [imagingLink, setImagingLink] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  async function run<T extends { ok: boolean; error?: string }>(
    label: string,
    fn: () => Promise<T>,
    successMsg: string,
  ) {
    setBusy(label);
    const r = await fn();
    setBusy(null);
    if (r.ok) {
      toast.success(successMsg);
      router.refresh();
    } else {
      toast.error('Action failed', { description: r.error ?? 'Unknown error' });
    }
  }

  if (isCancelled) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <div className="flex items-start gap-2">
          <XIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-600" />
          <div>
            <div className="text-sm font-semibold text-rose-900">Referral cancelled</div>
            <div className="mt-0.5 text-xs text-rose-800">No further action needed.</div>
          </div>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-2">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
          <div>
            <div className="text-sm font-semibold text-emerald-900">Imaging completed</div>
            <div className="mt-0.5 text-xs text-emerald-800">Referrer has been notified.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <header className="border-b border-neutral-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-neutral-700">What needs to happen?</h2>
      </header>
      <div className="space-y-3 p-5">
        {!isScheduled && (
          <ActionRow
            icon={CalendarIcon}
            title="Confirm appointment"
            description={
              appointmentId
                ? 'Mark the booked slot as confirmed and send the patient a reminder.'
                : 'No slot picked yet — schedule with the patient by phone, then mark complete when imaging is done.'
            }
            disabled={!appointmentId}
            disabledHint={!appointmentId ? 'Patient hasn’t picked a slot — call to schedule.' : undefined}
            actionLabel="Confirm"
            busy={busy === 'confirm'}
            onClick={() =>
              run('confirm', () => confirmAppointmentAction(appointmentId!), 'Appointment confirmed')
            }
          />
        )}

        <ActionRow
          icon={FileIcon}
          title="Mark imaging completed"
          description={
            showLinkInput
              ? 'Paste a PACS deeplink — the referring doctor will receive it by email.'
              : 'Imaging is done. Paste a PACS link if available so the doctor can view the study.'
          }
          actionLabel={showLinkInput ? 'Send & complete' : 'Complete'}
          busy={busy === 'complete'}
          onClick={async () => {
            if (showLinkInput && imagingLink.trim()) {
              await run(
                'complete',
                async () => {
                  const a = await attachImagingLinkAction(serviceRequestId, imagingLink.trim());
                  if (!a.ok) return a;
                  return completeReferralAction(serviceRequestId);
                },
                'Marked complete and link sent',
              );
              setShowLinkInput(false);
              setImagingLink('');
            } else if (!showLinkInput) {
              setShowLinkInput(true);
            } else {
              await run('complete', () => completeReferralAction(serviceRequestId), 'Marked complete');
              setShowLinkInput(false);
            }
          }}
        >
          {showLinkInput && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={imagingLink}
                onChange={(e) => setImagingLink(e.target.value)}
                placeholder="https://pacs.example.com/study/123"
                className="input flex-1"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void run('complete', () => completeReferralAction(serviceRequestId), 'Marked complete');
                    setShowLinkInput(false);
                  }}
                  className="btn-ghost text-xs"
                >
                  Skip link
                </button>
              </div>
            </div>
          )}
        </ActionRow>

        <ActionRow
          icon={XIcon}
          title="Cancel referral"
          description="Patient no-show, referrer revoked, or duplicate. The doctor and patient (if email on file) get notified."
          tone="danger"
          actionLabel={showCancelConfirm ? 'Confirm cancel' : 'Cancel'}
          busy={busy === 'cancel'}
          onClick={async () => {
            if (!showCancelConfirm) {
              setShowCancelConfirm(true);
              return;
            }
            await run(
              'cancel',
              () => cancelReferralAction(serviceRequestId, cancelReason.trim() || 'Cancelled by clinic'),
              'Referral cancelled',
            );
            setShowCancelConfirm(false);
            setCancelReason('');
          }}
        >
          {showCancelConfirm && (
            <div className="mt-2 flex flex-col gap-2">
              <input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason (optional, visible to referrer in the audit log)"
                className="input"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCancelConfirm(false);
                  setCancelReason('');
                }}
                className="text-xs text-neutral-500 hover:text-neutral-700"
              >
                Keep referral
              </button>
            </div>
          )}
        </ActionRow>
      </div>
      <footer className="border-t border-neutral-100 bg-neutral-50/40 px-5 py-2.5 text-xs text-neutral-500 flex items-center gap-1.5">
        <AlertCircleIcon className="h-3.5 w-3.5" />
        Status: <strong className="text-neutral-700">{status ?? 'unknown'}</strong>
        {appointmentId && (
          <>
            <span className="text-neutral-300">•</span>
            <span>Appointment <strong className="text-neutral-700">{isScheduled ? 'booked' : 'unbooked'}</strong></span>
          </>
        )}
      </footer>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  title,
  description,
  actionLabel,
  busy,
  onClick,
  disabled,
  disabledHint,
  tone = 'default',
  children,
}: {
  icon: (p: { className?: string }) => React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  busy: boolean;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string | undefined;
  tone?: 'default' | 'danger';
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-4 ${
        tone === 'danger' ? 'border-rose-100 bg-rose-50/30' : 'border-neutral-200 bg-white'
      }`}
    >
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
        tone === 'danger' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'
      }`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-neutral-600">{description}</div>
        {children}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        title={disabledHint}
        className={`flex-shrink-0 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
          tone === 'danger'
            ? 'bg-rose-600 text-white hover:bg-rose-700'
            : 'bg-emerald-600 text-white hover:bg-emerald-700'
        }`}
      >
        {busy ? 'Working…' : actionLabel}
      </button>
    </div>
  );
}
