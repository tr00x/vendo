'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  initialState,
  isStepActive,
  nextStep,
  reducer,
  type InitialSlots,
  type WizardStep,
} from './types';
import { ScheduleStep } from './ScheduleStep';
import { PatientStep } from './PatientStep';
import { StudyStep } from './StudyStep';
import { MriSafetyStep } from './MriSafetyStep';
import { PregnancyStep } from './PregnancyStep';
import { InsuranceStep } from './InsuranceStep';
import { ReviewStep } from './ReviewStep';
import { submitClinicBooking, submitReferral } from './actions';
import { CheckIcon, AlertCircleIcon } from '@/components/ui/icons';

export type WizardMode = 'referrer' | 'clinic';

// Storage key is per-mode so a referrer's in-progress draft can't leak
// into a clinic walk-in flow opened in the same browser. Bumped from v3
// → v4 when pregnancy step (idx 4) was inserted.
const STORAGE_KEY_BY_MODE: Record<WizardMode, string> = {
  referrer: 'vendo.wizard.v4',
  clinic: 'vendo.clinic-wizard.v1',
};

interface ModeCopy {
  pageTitle: string;
  pageBlurb: (visibleSteps: number) => string;
  successTitle: string;
  successDescription: string;
  successPath: (srId: string) => string;
}

const COPY_BY_MODE: Record<WizardMode, ModeCopy> = {
  referrer: {
    pageTitle: 'New referral',
    pageBlurb: (n) =>
      `Send a patient for imaging in ${n} quick steps. Progress saves automatically — you can close this tab and come back.`,
    successTitle: 'Referral submitted successfully',
    successDescription: 'The clinic has been notified and will contact the patient.',
    successPath: (srId) => `/refer/${srId}`,
  },
  clinic: {
    pageTitle: 'New booking',
    pageBlurb: (n) =>
      `Schedule imaging for a clinic patient in ${n} quick steps. Progress saves automatically — you can close this tab and come back.`,
    successTitle: 'Booking created',
    successDescription: 'The patient has been added to the schedule.',
    successPath: (srId) => `/clinic/inbox/${srId}`,
  },
};

interface StepDef {
  idx: WizardStep;
  label: string;
  description: string;
  // When false, the step is hidden from the progress stepper and skipped by
  // nextStep/prevStep helpers in types.ts.
  conditional?: boolean;
}

const STEPS: StepDef[] = [
  { idx: 0, label: 'Schedule',    description: 'Pick a study & time' },
  { idx: 1, label: 'Patient',     description: 'Who is being imaged' },
  { idx: 2, label: 'Study',       description: 'Body part & reason' },
  { idx: 3, label: 'MRI safety',  description: 'Metal & contrast check', conditional: true },
  { idx: 4, label: 'Pregnancy',   description: 'Radiation screening',    conditional: true },
  { idx: 5, label: 'Insurance',   description: 'Plan & coverage' },
  { idx: 6, label: 'Review',      description: 'Confirm & send' },
];

export function WizardShell({
  initialSlotsByModality,
  mode = 'referrer',
}: {
  initialSlotsByModality: InitialSlots[];
  mode?: WizardMode;
}) {
  const router = useRouter();
  const storageKey = STORAGE_KEY_BY_MODE[mode];
  const copy = COPY_BY_MODE[mode];
  // Initial render MUST match server render to avoid hydration mismatch
  // (React #418 in prod / "Hydration failed" in dev). sessionStorage rehydrate
  // happens in a post-mount effect — never inside useReducer's initializer.
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<typeof initialState> & { step?: number };
        const merged = { ...initialState, ...parsed } as typeof initialState;
        const rawStep = typeof parsed.step === 'number' ? parsed.step : 0;
        const clamped = Math.max(0, Math.min(6, rawStep)) as WizardStep;
        // Replace whole state in one go so the reducer doesn't fight a
        // partial re-application across N actions. The `_hydrate` action is
        // a thin wrapper that swaps in the merged snapshot.
        dispatch({ type: 'goto', step: clamped });
        // Only step is reachable through the existing reducer; the rest of
        // the form fields are restored via per-section dispatches so the
        // reducer's invariants (e.g. shape) stay intact.
        if (parsed.patient)   dispatch({ type: 'patient',   payload: parsed.patient });
        if (parsed.study)     dispatch({ type: 'study',     payload: parsed.study });
        if (parsed.insurance) dispatch({ type: 'insurance', payload: parsed.insurance });
        if (parsed.slot)      dispatch({ type: 'slot',      payload: parsed.slot });
        if (parsed.mriSafety) dispatch({ type: 'mriSafety', payload: parsed.mriSafety });
        if (parsed.pregnancy) dispatch({ type: 'pregnancy', payload: parsed.pregnancy });
      }
    } catch {
      // ignore parse / storage errors — user keeps a clean wizard
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const initialStepRef = useRef(state.step);

  useEffect(() => {
    if (initialStepRef.current === state.step) return;
    initialStepRef.current = state.step;
    stepContainerRef.current?.focus();
  }, [state.step]);

  useEffect(() => {
    // Don't write before the rehydrate effect ran — otherwise we'd clobber
    // the persisted draft with the freshly-mounted initialState.
    if (!hydrated) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
      setSavedAt(Date.now());
    } catch {
      // ignore quota errors
    }
  }, [state, storageKey, hydrated]);

  // Defensive: if a back-edit invalidates the current step (e.g. user
  // switched modality away from MRI while sitting on MRI safety, or
  // demographic edits make pregnancy screening newly required), walk to
  // the next active step. Using nextStep with the step BEFORE the current
  // one ensures we land on the first newly-active step at-or-after the
  // current cursor, instead of always jumping to a hard-coded index that
  // could itself skip a now-required conditional step.
  useEffect(() => {
    if (!isStepActive(state, state.step)) {
      const from = Math.max(0, (state.step as number) - 1) as WizardStep;
      dispatch({ type: 'goto', step: nextStep(state, from) });
    }
  }, [state, state.step]);

  const visibleSteps = useMemo(() => STEPS.filter((s) => isStepActive(state, s.idx)), [state]);
  const currentVisibleIndex = visibleSteps.findIndex((s) => s.idx === state.step);

  async function onSubmit() {
    let alreadyInFlight = false;
    setSubmitting((prev) => {
      if (prev) {
        alreadyInFlight = true;
        return prev;
      }
      return true;
    });
    if (alreadyInFlight) return;
    setError(null);
    const result =
      mode === 'clinic' ? await submitClinicBooking(state) : await submitReferral(state);
    setSubmitting(false);
    if (result.ok) {
      sessionStorage.removeItem(storageKey);
      toast.success(copy.successTitle, { description: copy.successDescription });
      router.push(copy.successPath(result.serviceRequestId));
    } else if (result.code === 'slot-taken') {
      setError('That slot was just taken by someone else. Please pick another.');
      toast.error('Slot already taken', { description: 'Please pick another time.' });
      dispatch({ type: 'goto', step: 0 });
    } else if (result.code === 'mri-unsafe') {
      setError(result.error ?? 'MRI safety check failed');
      toast.error('MRI safety check failed', { description: result.error });
      dispatch({ type: 'goto', step: 3 });
    } else if (result.code === 'pregnancy-unsafe') {
      setError(result.error ?? 'Pregnancy screening incomplete');
      toast.error('Pregnancy screening incomplete', { description: result.error });
      dispatch({ type: 'goto', step: 4 });
    } else {
      setError(result.error ?? 'Submission failed');
      toast.error('Submission failed', { description: result.error });
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-tightish text-ink">{copy.pageTitle}</h1>
        <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-smoke">
          {copy.pageBlurb(visibleSteps.length)}
        </p>
      </div>

      {/* Progress stepper — renders only the steps active for the current
          modality, so non-MRI users still see a clean N-step flow. */}
      <ol className="mb-6 flex w-full items-start gap-1 sm:gap-3" aria-label="Wizard progress">
        {visibleSteps.map((s, vIdx) => {
          const isPast = vIdx < currentVisibleIndex;
          const isCurrent = s.idx === state.step;
          const canJump = vIdx <= currentVisibleIndex;
          return (
            <li
              key={s.label}
              className="flex flex-1 flex-col"
              {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
            >
              <button
                type="button"
                aria-label={`Step ${vIdx + 1} of ${visibleSteps.length}: ${s.label}${
                  isCurrent ? ' (current)' : isPast ? ' (completed)' : ''
                }`}
                title={canJump ? `Go to ${s.label} — ${s.description}` : `${s.label} — finish earlier steps first`}
                onClick={() => canJump && dispatch({ type: 'goto', step: s.idx })}
                disabled={!canJump}
                className={`group flex flex-col items-start text-left disabled:cursor-not-allowed ${
                  canJump ? 'cursor-pointer' : ''
                }`}
              >
                <div className="flex w-full items-center gap-2">
                  <div
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition ${
                      isPast
                        ? 'bg-cta text-white'
                        : isCurrent
                        ? 'bg-cta text-white ring-4 ring-ink/10'
                        : 'border border-hairline bg-paper text-ash'
                    }`}
                  >
                    {isPast ? <CheckIcon className="h-3.5 w-3.5" /> : vIdx + 1}
                  </div>
                  <div className={`h-0.5 flex-1 transition ${isPast ? 'bg-ink' : 'bg-hairline'}`} />
                </div>
                <div className="mt-2 hidden sm:block">
                  <div
                    className={`text-[12.5px] font-semibold tracking-tightish ${
                      isPast || isCurrent ? 'text-ink' : 'text-smoke'
                    }`}
                  >
                    {s.label}
                  </div>
                  <div className="mt-0.5 text-[11.5px] leading-tight text-smoke">
                    {s.description}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      <div
        ref={stepContainerRef}
        tabIndex={-1}
        className="rounded-md border border-hairline bg-paper p-6 sm:p-8 animate-fade-in focus:outline-none"
      >
        {state.step === 0 && (
          <ScheduleStep state={state} dispatch={dispatch} slotsByModality={initialSlotsByModality} />
        )}
        {state.step === 1 && <PatientStep state={state} dispatch={dispatch} />}
        {state.step === 2 && <StudyStep state={state} dispatch={dispatch} />}
        {state.step === 3 && <MriSafetyStep state={state} dispatch={dispatch} />}
        {state.step === 4 && <PregnancyStep state={state} dispatch={dispatch} />}
        {state.step === 5 && <InsuranceStep state={state} dispatch={dispatch} />}
        {state.step === 6 && (
          <ReviewStep
            state={state}
            dispatch={dispatch}
            onSubmit={() => void onSubmit()}
            submitting={submitting}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 text-[12px] text-smoke">
        {savedAt ? (
          <div className="flex items-center gap-1.5" title="We save your progress to your browser as you go. If you close the tab, you'll come back to where you left off.">
            <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
            <span>Progress saved automatically</span>
          </div>
        ) : (
          <span />
        )}
        {error && (
          <div className="flex items-center gap-1.5 text-signal-stop" role="alert">
            <AlertCircleIcon className="h-3.5 w-3.5" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
