'use client';

import { useState, type Dispatch } from 'react';
import { mriSafetyStepSchema, type MriSafetyStepInput, type Trinary } from '@/lib/fhir/schemas';
import { initialMriSafety, nextStep, prevStep, type WizardAction, type WizardState } from './types';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  StethoscopeIcon,
} from '@/components/ui/icons';

interface Props {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

const PACEMAKER_BLOCK_MSG =
  'A pacemaker, defibrillator, or implanted neurostimulator is a contraindication for MRI. Please call the clinic at (516) 303-8008 to discuss alternatives.';
const GFR_BLOCK_MSG =
  'IV contrast is contraindicated when eGFR is below 30 mL/min/1.73m² due to risk of nephrogenic systemic fibrosis. Order the study without contrast or call the clinic.';
const GFR_WARN_MSG =
  'eGFR 30–60 — borderline kidney function. Clinic will review and may contact the patient before contrast administration.';

export function MriSafetyStep({ state, dispatch }: Props) {
  const [draft, setDraft] = useState<MriSafetyStepInput>(state.mriSafety ?? initialMriSafety);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function update<K extends keyof MriSafetyStepInput>(key: K, value: MriSafetyStepInput[K]) {
    setDraft({ ...draft, [key]: value });
    if (errors[key as string]) {
      const next = { ...errors };
      delete next[key as string];
      setErrors(next);
    }
  }

  // Hard-block conditions are surfaced inline so the user understands why
  // Next is disabled. Server re-checks the same conditions in submitReferral.
  const pacemakerBlocked = draft.pacemaker === 'yes';
  const lowGfrBlocked =
    draft.withContrast === 'yes' && draft.gfr != null && draft.gfr < 30;
  const borderlineGfr =
    draft.withContrast === 'yes' && draft.gfr != null && draft.gfr >= 30 && draft.gfr < 60;
  const blocked = pacemakerBlocked || lowGfrBlocked;

  function onNext() {
    if (blocked) return;
    const parsed = mriSafetyStepSchema.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] = i.message;
      setErrors(errs);
      return;
    }
    dispatch({ type: 'mriSafety', payload: parsed.data });
    dispatch({ type: 'goto', step: nextStep(state, 3) });
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <StethoscopeIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">MRI safety screening</h2>
          <p className="text-sm text-neutral-500">
            A few quick questions about implants, contrast, and comfort. The clinic uses these to
            confirm the patient can safely have the study.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <TrinaryField
          label="Does the patient have a pacemaker, defibrillator, or implanted neurostimulator?"
          required
          value={draft.pacemaker}
          onChange={(v) => update('pacemaker', v)}
        />
        {pacemakerBlocked && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
            <div className="flex items-start gap-2 text-sm text-red-900">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
              <span>{PACEMAKER_BLOCK_MSG}</span>
            </div>
          </div>
        )}

        <TrinaryField
          label="Other metal implants (surgical clips, joint replacements, shrapnel, cochlear)?"
          value={draft.metalImplants}
          onChange={(v) => {
            update('metalImplants', v);
            if (v !== 'yes') update('metalImplantType', '');
          }}
        />
        {draft.metalImplants === 'yes' && (
          <div>
            <label className="label">
              Describe the implant <span className="text-red-500">*</span>
            </label>
            <input
              value={draft.metalImplantType}
              onChange={(e) => update('metalImplantType', e.target.value)}
              placeholder="e.g. Right hip replacement (titanium, 2019)"
              className={`input ${errors.metalImplantType ? 'input-error' : ''}`}
            />
            {errors.metalImplantType ? (
              <p className="err">
                <AlertCircleIcon className="h-3.5 w-3.5" />
                {errors.metalImplantType}
              </p>
            ) : (
              <p className="help">Tech will verify MR-conditional status before scan.</p>
            )}
          </div>
        )}

        <YesNoField
          label="Has the patient experienced claustrophobia in confined spaces?"
          value={draft.claustrophobia}
          onChange={(v) => update('claustrophobia', v)}
        />

        <YesNoField
          label="Will this MRI use IV contrast (gadolinium)?"
          value={draft.withContrast}
          onChange={(v) => {
            update('withContrast', v);
            if (v === 'no') update('gfr', null);
          }}
        />
        {draft.withContrast === 'yes' && (
          <div>
            <label className="label">
              Most recent eGFR (mL/min/1.73m²) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={draft.gfr ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                update('gfr', raw === '' ? null : Number(raw));
              }}
              placeholder="e.g. 90"
              className={`input max-w-xs font-mono ${errors.gfr ? 'input-error' : ''}`}
            />
            {errors.gfr && (
              <p className="err">
                <AlertCircleIcon className="h-3.5 w-3.5" />
                {errors.gfr}
              </p>
            )}
            {lowGfrBlocked && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
                <div className="flex items-start gap-2 text-sm text-red-900">
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
                  <span>{GFR_BLOCK_MSG}</span>
                </div>
              </div>
            )}
            {borderlineGfr && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2 text-sm text-amber-900">
                  <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <span>{GFR_WARN_MSG}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            // Persist the in-progress draft on Back so a subsequent direct
            // jump to Review (via the stepper buttons) submits the user's
            // typed answers, not a stale `initialMriSafety`. The schema
            // still gates submit, so partial drafts can't pass — but a
            // user who answered every question won't lose them.
            dispatch({ type: 'mriSafety', payload: draft });
            dispatch({ type: 'goto', step: prevStep(state, 3) });
          }}
          className="btn-secondary"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={blocked}
          aria-disabled={blocked}
          className="btn-primary disabled:!cursor-not-allowed disabled:!opacity-60"
        >
          Next <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

function TrinaryField({
  label,
  required,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: Trinary;
  onChange: (v: Trinary) => void;
}) {
  return (
    <fieldset>
      <legend className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {(['yes', 'no', 'unknown'] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            aria-pressed={value === opt}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition ${
              value === opt
                ? opt === 'yes'
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : opt === 'no'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-neutral-300 bg-neutral-100 text-neutral-700'
                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 'yes' | 'no';
  onChange: (v: 'yes' | 'no') => void;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {(['yes', 'no'] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            aria-pressed={value === opt}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition ${
              value === opt
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
