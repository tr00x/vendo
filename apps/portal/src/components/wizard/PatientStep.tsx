'use client';

import { useState, type Dispatch } from 'react';
import { patientStepSchema } from '@/lib/fhir/schemas';
import type { WizardAction, WizardState } from './types';
import { findExistingPatientsAction } from './actions';
import type { PatientMatch } from './actions';
import { AlertCircleIcon, ArrowLeftIcon, ArrowRightIcon, UserIcon, InfoIcon } from '@/components/ui/icons';

interface Props {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

export function PatientStep({ state, dispatch }: Props) {
  const [draft, setDraft] = useState(state.patient);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [matches, setMatches] = useState<PatientMatch[] | null>(null);
  const [searching, setSearching] = useState(false);

  function onChange<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft({ ...draft, [key]: value });
    if (errors[key as string]) {
      const next = { ...errors };
      delete next[key as string];
      setErrors(next);
    }
  }

  async function onNext() {
    const parsed = patientStepSchema.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[issue.path.join('.')] = issue.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setSearching(true);
    try {
      const found = await findExistingPatientsAction({
        family: draft.family,
        given: draft.given,
        birthDate: draft.birthDate,
        phone: draft.phone,
      });
      if (found.length > 0) {
        setMatches(found);
        return;
      }
      dispatch({ type: 'patient', payload: { ...parsed.data, existingPatientId: null } });
      dispatch({ type: 'goto', step: 2 });
    } finally {
      setSearching(false);
    }
  }

  function pickExisting(id: string | null) {
    dispatch({ type: 'patient', payload: { ...draft, existingPatientId: id } });
    dispatch({ type: 'goto', step: 2 });
    setMatches(null);
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <UserIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Patient information</h2>
          <p className="text-sm text-neutral-500">Who are you referring? We&apos;ll check if they&apos;re already in our system.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="First name" required error={errors.given}>
          <input
            value={draft.given}
            onChange={(e) => onChange('given', e.target.value)}
            placeholder="e.g. James"
            autoComplete="given-name"
            className={`input ${errors.given ? 'input-error' : ''}`}
          />
        </Field>
        <Field label="Last name" required error={errors.family}>
          <input
            value={draft.family}
            onChange={(e) => onChange('family', e.target.value)}
            placeholder="e.g. Whitfield"
            autoComplete="family-name"
            className={`input ${errors.family ? 'input-error' : ''}`}
          />
        </Field>
        <Field label="Date of birth" required error={errors.birthDate} hint="Format: YYYY-MM-DD">
          <input
            type="date"
            value={draft.birthDate}
            onChange={(e) => onChange('birthDate', e.target.value)}
            className={`input ${errors.birthDate ? 'input-error' : ''}`}
          />
        </Field>
        <Field label="Sex" required error={errors.sex}>
          <select
            value={draft.sex}
            onChange={(e) => onChange('sex', e.target.value as typeof draft.sex)}
            className={`input ${errors.sex ? 'input-error' : ''}`}
          >
            <option value="unknown">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Phone" required error={errors.phone} hint="The clinic will call to schedule">
          <input
            type="tel"
            value={draft.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            placeholder="(516) 555-0100"
            autoComplete="tel"
            className={`input ${errors.phone ? 'input-error' : ''}`}
          />
        </Field>
        <Field label="Email" error={errors.email} hint="Optional — used for appointment confirmations">
          <input
            type="email"
            value={draft.email ?? ''}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="patient@example.com"
            autoComplete="email"
            className={`input ${errors.email ? 'input-error' : ''}`}
          />
        </Field>
      </div>

      {/* Phase 2.3 — allergy attestation. Stays here (not on a separate step)
          so referrers see it in the same context as the rest of the patient
          intake. The IV-contrast question is a trinary so 'unknown' is a
          first-class answer rather than an unsafe default of 'no'. */}
      <fieldset className="mt-6 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
          Allergy attestation
        </legend>
        <div className="space-y-4">
          <div>
            <label className="label">
              Known allergies <span className="text-neutral-400 font-normal">(comma-separated)</span>
            </label>
            <input
              value={draft.allergies}
              onChange={(e) => onChange('allergies', e.target.value)}
              placeholder="e.g. shellfish, iodine, latex — or leave blank if none reported"
              maxLength={500}
              className={`input ${errors.allergies ? 'input-error' : ''}`}
            />
            {errors.allergies && (
              <p className="err">
                <AlertCircleIcon className="h-3.5 w-3.5" />
                {errors.allergies}
              </p>
            )}
          </div>
          <fieldset>
            <legend className="label">
              IV contrast allergy?{' '}
              <span className="text-neutral-400 font-normal">(prior gadolinium / iodinated reaction)</span>
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {(['yes', 'no', 'unknown'] as const).map((opt) => {
                const active = draft.ivContrastAllergy === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onChange('ivContrastAllergy', opt)}
                    aria-pressed={active}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition ${
                      active
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
                );
              })}
            </div>
          </fieldset>
        </div>
      </fieldset>

      <div className="mt-8 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => dispatch({ type: 'goto', step: 0 })}
          className="btn-secondary"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 text-xs text-neutral-500 sm:flex">
            <InfoIcon className="h-4 w-4" />
            We check for duplicates first.
          </div>
          <button
            type="button"
            onClick={() => void onNext()}
            disabled={searching}
            className="btn-primary"
          >
            {searching ? 'Checking…' : 'Next'}
            {!searching && <ArrowRightIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {matches && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="card max-w-md w-full p-6 animate-slide-up">
            <h3 className="text-base font-semibold">We found a possible match</h3>
            <p className="mt-1 text-sm text-neutral-600">
              {matches.length === 1 ? 'A patient' : `${matches.length} patients`} with that name already exist in your records.
              Refer one of them, or create a new patient if these aren&apos;t the same person.
            </p>
            <ul className="my-4 space-y-2">
              {matches.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {m.given} {m.family}
                    </div>
                    <div className="text-xs text-neutral-500">DOB {m.birthDate}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => pickExisting(m.id)}
                    className="btn-secondary !py-1 !px-3 !text-xs"
                  >
                    Use this patient
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
              <button type="button" onClick={() => setMatches(null)} className="btn-secondary">
                Back
              </button>
              <button type="button" onClick={() => pickExisting(null)} className="btn-primary">
                Create new patient
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {error ? (
        <span className="err">
          <AlertCircleIcon className="h-3.5 w-3.5" />
          {error}
        </span>
      ) : (
        hint && <span className="help">{hint}</span>
      )}
    </label>
  );
}
