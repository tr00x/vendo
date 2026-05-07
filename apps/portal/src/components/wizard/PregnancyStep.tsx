'use client';

import { useState, type Dispatch } from 'react';
import { pregnancyStepSchema, type PregnancyStepInput, type Trinary } from '@/lib/fhir/schemas';
import { initialPregnancy, nextStep, prevStep, type WizardAction, type WizardState } from './types';
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

const PREGNANT_OVERRIDE_NOTE =
  'X-ray exposure during pregnancy is generally avoided. If the study is clinically necessary, document the reason — the clinic will coordinate shielding and may contact you to confirm.';

export function PregnancyStep({ state, dispatch }: Props) {
  const [draft, setDraft] = useState<PregnancyStepInput>(state.pregnancy ?? initialPregnancy);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function update<K extends keyof PregnancyStepInput>(key: K, value: PregnancyStepInput[K]) {
    setDraft({ ...draft, [key]: value });
    if (errors[key as string]) {
      const next = { ...errors };
      delete next[key as string];
      setErrors(next);
    }
  }

  // Server re-checks the same condition; this guard keeps the Next button
  // disabled until the doctor either rules out pregnancy or supplies a
  // written override reason.
  const blockedForOverride =
    draft.pregnant === 'yes' && draft.overrideReason.trim().length === 0;

  function onNext() {
    if (blockedForOverride) {
      setErrors({ overrideReason: 'Reason required when patient is pregnant' });
      return;
    }
    const parsed = pregnancyStepSchema.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] = i.message;
      setErrors(errs);
      return;
    }
    dispatch({ type: 'pregnancy', payload: parsed.data });
    dispatch({ type: 'goto', step: nextStep(state, 4) });
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <StethoscopeIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Pregnancy screening</h2>
          <p className="text-sm text-neutral-500">
            X-ray uses ionizing radiation. Required for any female patient of childbearing age (12–55).
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <TrinaryField
          label="Is the patient pregnant?"
          required
          value={draft.pregnant}
          onChange={(v) => update('pregnant', v)}
        />

        <div>
          <label className="label">
            Last menstrual period (LMP){' '}
            <span className="text-neutral-400 font-normal">(optional — helps confirm)</span>
          </label>
          <input
            type="date"
            value={draft.lmpDate ?? ''}
            onChange={(e) => update('lmpDate', e.target.value)}
            className={`input max-w-xs ${errors.lmpDate ? 'input-error' : ''}`}
          />
          {errors.lmpDate && (
            <p className="err">
              <AlertCircleIcon className="h-3.5 w-3.5" />
              {errors.lmpDate}
            </p>
          )}
        </div>

        {draft.pregnant === 'yes' && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="mb-3 flex items-start gap-2 text-sm text-red-900" role="alert">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
              <span>{PREGNANT_OVERRIDE_NOTE}</span>
            </div>
            <label className="label text-red-900">
              Clinical reason to proceed despite pregnancy <span className="text-red-500">*</span>
            </label>
            <textarea
              value={draft.overrideReason ?? ''}
              onChange={(e) => update('overrideReason', e.target.value)}
              placeholder="e.g. Suspected pulmonary embolism — risk of missed diagnosis exceeds fetal radiation risk."
              rows={3}
              maxLength={500}
              className={`input resize-none ${errors.overrideReason ? 'input-error' : ''}`}
            />
            {errors.overrideReason && (
              <p className="err">
                <AlertCircleIcon className="h-3.5 w-3.5" />
                {errors.overrideReason}
              </p>
            )}
          </div>
        )}

        {draft.pregnant === 'unknown' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <span>
                The clinic will confirm with the patient on arrival and may offer a urine pregnancy
                test before the study.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            // Same rationale as MriSafetyStep — preserve typed answers so
            // a direct stepper jump to Review doesn't reset to defaults.
            dispatch({ type: 'pregnancy', payload: draft });
            dispatch({ type: 'goto', step: prevStep(state, 4) });
          }}
          className="btn-secondary"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={blockedForOverride}
          aria-disabled={blockedForOverride}
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
