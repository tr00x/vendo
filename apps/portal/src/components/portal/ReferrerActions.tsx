'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { XIcon } from '@/components/ui/icons';
import { cancelMyReferralAction } from './actions';

export function ReferrerActions({ serviceRequestId }: { serviceRequestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Phase 4.6 — reason is now required by the server. The UI mirrors the
  // server check (≥ 3 trimmed chars) and disables Confirm until satisfied.
  const reasonValid = reason.trim().length >= 3;

  async function submit() {
    if (!reasonValid) return;
    setBusy(true);
    const r = await cancelMyReferralAction(serviceRequestId, reason.trim());
    setBusy(false);
    if (r.ok) {
      toast.success('Referral withdrawn');
      router.refresh();
      setOpen(false);
    } else {
      toast.error('Could not withdraw', { description: r.error });
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-md border border-hairline bg-paper px-5 py-3.5">
        <div>
          <div className="text-[13.5px] font-semibold tracking-tightish text-ink">
            Sent this by mistake, or no longer need it?
          </div>
          <div className="mt-0.5 text-[12.5px] text-smoke">
            Cancelling notifies the clinic and frees up any booked appointment. The patient is also told (if we have their email).
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Cancel this referral — undo cannot be done after confirming"
          className="inline-flex flex-shrink-0 items-center justify-center rounded-md border border-signal-stop/30 bg-paper px-3.5 py-2 text-[13px] font-medium text-signal-stop transition hover:bg-signal-stop/5"
        >
          Cancel referral
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-cta/40 p-4 animate-fade-in backdrop-blur-sm"
          onClick={() => setOpen(false)}
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
                  This is permanent. Any booked appointment is freed up, and the clinic and patient are notified. You&apos;ll need to send a new referral if you change your mind.
                </p>
              </div>
            </div>
            <label className="mt-5 block">
              <span className="label">
                Why are you cancelling? <span className="text-signal-stop">*</span>{' '}
                <span className="font-normal text-smoke">(the clinic will see this)</span>
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Patient is feeling better and no longer needs imaging. Ordering a different study instead."
                rows={3}
                maxLength={500}
                className="input resize-none"
              />
              <div className="help">A few words is enough. The clinic needs this to update their records.</div>
            </label>
            <div className="mt-5 flex justify-end gap-2 border-t border-hairline pt-4">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
                Keep it active
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !reasonValid}
                className="inline-flex items-center justify-center rounded-md bg-signal-stop px-4 py-2 text-[13px] font-medium text-white transition hover:bg-signal-stop/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Cancelling…' : 'Yes, cancel referral'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
