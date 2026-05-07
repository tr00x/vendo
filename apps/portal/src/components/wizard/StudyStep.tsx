'use client';

import { useState, type Dispatch } from 'react';
import { studyStepSchema } from '@/lib/fhir/schemas';
import { nextStep, prevStep, type WizardAction, type WizardState } from './types';
import { modalityMeta } from '@/lib/format';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  StethoscopeIcon,
  SparkleIcon,
} from '@/components/ui/icons';

interface Props {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

const COMMON_BODY_PARTS: Record<string, string[]> = {
  MRI: ['Lumbar spine', 'Cervical spine', 'Right knee', 'Left knee', 'Right shoulder', 'Left shoulder', 'Brain w/ and w/o contrast', 'Right ankle'],
  XRAY: ['Chest 2-view', 'Right hip', 'Left hip', 'Cervical spine', 'Lumbar spine 2-view', 'Right wrist', 'Right ankle 3-view'],
  ARK: ['Carotid arteries', 'Lower extremity venous duplex', 'Thyroid ultrasound', 'Abdominal aorta'],
};

const COMMON_REASONS: Array<{ code: string; text: string }> = [
  { code: 'M54.5', text: 'Low back pain' },
  { code: 'M25.551', text: 'Pain in right hip' },
  { code: 'S83.241A', text: 'Tear of medial meniscus, right knee' },
  { code: 'M75.101', text: 'Rotator cuff tear' },
  { code: 'R51.9', text: 'Headache' },
  { code: 'R05.9', text: 'Cough' },
  { code: 'I65.23', text: 'Carotid stenosis' },
  { code: 'I82.401', text: 'R/o DVT' },
];

export function StudyStep({ state, dispatch }: Props) {
  const [draft, setDraft] = useState(state.study);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft({ ...draft, [key]: value });
    if (errors[key as string]) {
      const next = { ...errors };
      delete next[key as string];
      setErrors(next);
    }
  }

  function onNext() {
    const parsed = studyStepSchema.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] = i.message;
      setErrors(errs);
      return;
    }
    dispatch({ type: 'study', payload: parsed.data });
    // Pass an updated state into the helper so the modality the user just
    // committed (rather than the stale state in closure) decides whether the
    // MRI safety step is the next destination.
    const projected = { ...state, study: parsed.data };
    dispatch({ type: 'goto', step: nextStep(projected, 2) });
  }

  const bodyParts = COMMON_BODY_PARTS[draft.modality] ?? [];

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
          <StethoscopeIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Study request</h2>
          <p className="text-sm text-neutral-500">What imaging are you requesting and why?</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Modality is locked — chosen in step 1 */}
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
          <div className="flex items-center gap-3">
            {(() => {
              const m = modalityMeta(draft.modality);
              return (
                <>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset font-semibold text-xs ${m.chipClass}`}>
                    {draft.modality === 'MRI' ? 'MRI' : draft.modality === 'XRAY' ? 'XR' : 'US'}
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Modality</div>
                    <div className="text-sm font-semibold">{m.label} <span className="text-xs font-normal text-neutral-500">— {m.description}</span></div>
                  </div>
                </>
              );
            })()}
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'goto', step: 0 })}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Change
          </button>
        </div>

        {/* Body part with quick chips */}
        <div>
          <label className="label">
            Body part <span className="text-red-500">*</span>
          </label>
          <input
            value={draft.bodyPart}
            onChange={(e) => update('bodyPart', e.target.value)}
            placeholder="e.g. Right knee"
            list="body-parts"
            className={`input ${errors.bodyPart ? 'input-error' : ''}`}
          />
          <datalist id="body-parts">
            {bodyParts.map((bp) => (
              <option key={bp} value={bp} />
            ))}
          </datalist>
          {errors.bodyPart && (
            <p className="err">
              <AlertCircleIcon className="h-3.5 w-3.5" />
              {errors.bodyPart}
            </p>
          )}
          {bodyParts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bodyParts.slice(0, 6).map((bp) => (
                <button
                  key={bp}
                  type="button"
                  onClick={() => update('bodyPart', bp)}
                  className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700 transition hover:bg-indigo-100 hover:text-indigo-700"
                >
                  {bp}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reason */}
        <div>
          <label className="label">
            Reason for study <span className="text-red-500">*</span>
          </label>
          <input
            value={draft.reason}
            onChange={(e) => update('reason', e.target.value)}
            placeholder="e.g. Persistent pain after fall"
            className={`input ${errors.reason ? 'input-error' : ''}`}
          />
          {errors.reason ? (
            <p className="err">
              <AlertCircleIcon className="h-3.5 w-3.5" />
              {errors.reason}
            </p>
          ) : (
            <p className="help flex items-center gap-1">
              <SparkleIcon className="h-3.5 w-3.5 text-violet-400" />
              Common ICD-10 quick-pick:
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COMMON_REASONS.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => update('reason', `${r.code} — ${r.text}`)}
                className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-700 transition hover:bg-indigo-100 hover:text-indigo-700"
              >
                <span className="font-mono text-[10px] text-neutral-500 mr-1">{r.code}</span>
                {r.text}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="label">Clinical notes</label>
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Any additional context — duration of symptoms, prior imaging, conservative treatments tried, etc."
            rows={4}
            maxLength={2000}
            className="input resize-none"
          />
          <p className="help">
            {(draft.notes ?? '').length} / 2000 characters
          </p>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: 'goto', step: prevStep(state, 2) })}
          className="btn-secondary"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back
        </button>
        <button type="button" onClick={onNext} className="btn-primary">
          Next <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
