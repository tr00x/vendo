'use client';

import { useState, type Dispatch } from 'react';
import { MODALITIES } from '@/lib/fhir/schemas';
import { modalityMeta, formatDayTime } from '@/lib/format';
import { CalendarPicker, type SlotSummary } from './CalendarPicker';
import type { WizardAction, WizardState, InitialSlots } from './types';
import {
  ArrowRightIcon,
  CalendarIcon,
  PhoneIcon,
} from '@/components/ui/icons';

interface Props {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  slotsByModality: InitialSlots[];
}

export function ScheduleStep({ state, dispatch, slotsByModality }: Props) {
  const [modality, setModality] = useState<typeof state.study.modality>(state.study.modality);
  const [picked, setPicked] = useState<SlotSummary | null>(
    state.slot.slotId && state.slot.start && state.slot.end
      ? { id: state.slot.slotId, start: state.slot.start, end: state.slot.end }
      : null,
  );

  const slots = (slotsByModality.find((m) => m.modality === modality)?.slots ?? [])
    .filter((s): s is { id: string; start: string; end: string } => !!s.id && !!s.start && !!s.end);

  function commitAndNext(slot: SlotSummary | null) {
    dispatch({ type: 'study', payload: { ...state.study, modality } });
    dispatch({
      type: 'slot',
      payload: {
        slotId: slot?.id ?? null,
        start: slot?.start ?? null,
        end: slot?.end ?? null,
      },
    });
    dispatch({ type: 'goto', step: 1 });
  }

  function continueWithSlot() {
    commitAndNext(picked);
  }

  function clinicWillCall() {
    commitAndNext(null);
  }

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
          <CalendarIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-[18px] font-semibold tracking-tightish text-ink">
            Schedule the imaging
          </h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-smoke">
            Pick the type of study and a time slot. If nothing fits, you can let the clinic call your patient to schedule.
          </p>
        </div>
      </div>

      {/* Modality switcher */}
      <fieldset className="mb-6">
        <legend className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-ink">
            Type of imaging <span className="text-signal-stop">*</span>
          </span>
          <span className="text-[11.5px] text-smoke">Pick one</span>
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODALITIES.map((code) => {
            const m = modalityMeta(code);
            const active = modality === code;
            const short = code === 'MRI' ? 'MRI' : code === 'XRAY' ? 'XR' : 'US';
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setModality(code);
                  setPicked(null);
                }}
                aria-pressed={active}
                title={m.description}
                className={`flex items-start gap-3 rounded-md border p-3.5 text-left transition ${
                  active
                    ? 'border-ink bg-bone shadow-[inset_0_0_0_1px_var(--ink)]'
                    : 'border-hairline bg-paper hover:border-ink/40 hover:bg-bone/50'
                }`}
              >
                <div
                  className={`flex h-10 w-12 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tracking-tightish ${
                    active
                      ? 'bg-cta text-white'
                      : 'border border-hairline bg-bone text-graphite'
                  }`}
                >
                  {short}
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold tracking-tightish text-ink">{m.label}</div>
                  <div className="mt-0.5 text-[11.5px] leading-snug text-smoke line-clamp-2">{m.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Calendar */}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-ink">
            Pick a time slot
          </span>
          <span className="hidden text-[11.5px] text-smoke sm:inline">
            All times shown in the clinic timezone (ET)
          </span>
        </div>
        <CalendarPicker slots={slots} selectedSlotId={picked?.id ?? null} onPick={setPicked} />
      </div>

      {/* Clinic-will-call alternative */}
      <div className="mt-5 flex items-start gap-3 rounded-md border border-hairline bg-bone px-4 py-3.5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-hairline bg-paper text-graphite">
          <PhoneIcon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold tracking-tightish text-ink">
            Don&apos;t see a good time?
          </div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-smoke">
            Skip slot selection. The front desk will call your patient within one business day to schedule.
          </p>
        </div>
        <button
          type="button"
          onClick={clinicWillCall}
          className="btn-secondary flex-shrink-0"
          title="Submit without picking a time — clinic will call the patient"
        >
          Clinic will call
        </button>
      </div>

      <div className="mt-7 flex items-center justify-between gap-3 border-t border-hairline pt-5">
        <div className="text-[12.5px]">
          {picked ? (
            <span className="inline-flex items-center gap-2 text-graphite">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              <span>Selected: <strong className="font-semibold text-ink">{formatDayTime(picked.start)}</strong></span>
            </span>
          ) : (
            <span className="text-smoke">No time selected yet — pick a slot above or use &quot;Clinic will call&quot;.</span>
          )}
        </div>
        <button
          type="button"
          onClick={continueWithSlot}
          disabled={!picked}
          className="btn-primary"
          title={picked ? 'Continue to patient details' : 'Pick a time first'}
        >
          Continue <ArrowRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}
