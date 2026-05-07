'use client';

import { useState } from 'react';
import { CalendarPicker, type SlotSummary } from '@/components/wizard/CalendarPicker';
import { formatDayTime } from '@/lib/format';
import { XIcon } from '@/components/ui/icons';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  slots: SlotSummary[];
  onConfirm: (slot: SlotSummary, reason: string) => Promise<void>;
  // Phase 4.5 — when true, the modal demands a reschedule reason before
  // Confirm becomes enabled. Initial scheduling doesn't need a reason
  // (there's no prior state to explain), so the textbox is hidden.
  requireReason?: boolean;
}

export function ScheduleModal({ open, onClose, title, slots, onConfirm, requireReason }: Props) {
  const [picked, setPicked] = useState<SlotSummary | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  const reasonValid = !requireReason || reason.trim().length >= 3;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-cta/40 p-4 animate-fade-in backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-md border border-hairline bg-paper shadow-xl animate-slide-up"
      >
        <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div>
            <h3 className="text-[15.5px] font-semibold tracking-tightish text-ink">{title}</h3>
            <p className="mt-0.5 text-[12.5px] text-smoke">
              Pick a free slot — the patient and referring doctor will be notified by email.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-smoke hover:bg-hairline/60 hover:text-ink"
            aria-label="Close"
            title="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        {/* Scrollable body so the modal stays under 85vh even when the
            calendar's inner grid is tall. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <CalendarPicker slots={slots} selectedSlotId={picked?.id ?? null} onPick={setPicked} />

          {requireReason && (
            <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-3.5">
              <label className="mb-1.5 block text-[12.5px] font-medium text-amber-900">
                Why are you rescheduling? <span className="text-signal-stop">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Patient called — work conflict; tech equipment service window."
                rows={2}
                maxLength={500}
                className="input resize-none"
              />
              <p className="mt-1 text-[11.5px] text-amber-900/80">
                Visible to the referring doctor on the activity timeline.
              </p>
            </div>
          )}
        </div>

        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-hairline px-5 py-3">
          <div className="text-[13px]">
            {picked ? (
              <span className="inline-flex items-center gap-2 text-graphite">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                <span>
                  Selected: <strong className="font-semibold text-ink">{formatDayTime(picked.start)}</strong>
                </span>
              </span>
            ) : (
              <span className="text-smoke">No time selected.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              disabled={!picked || busy || !reasonValid}
              onClick={async () => {
                if (!picked || !reasonValid) return;
                setBusy(true);
                try {
                  await onConfirm(picked, reason.trim());
                } finally {
                  setBusy(false);
                }
              }}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Confirm time'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
