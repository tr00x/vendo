'use client';

import { useState, type Dispatch } from 'react';
import { toast } from 'sonner';
import { insuranceStepSchema } from '@/lib/fhir/schemas';
import { nextStep, prevStep, type WizardAction, type WizardState } from './types';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ShieldIcon,
  UploadIcon,
  FileIcon,
  TrashIcon,
  CheckIcon,
} from '@/components/ui/icons';

interface Props {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

const COMMON_PAYORS = [
  'Aetna PPO',
  'BlueCross BlueShield',
  'Empire BlueCross BlueShield',
  'Cigna Open Access Plus',
  'UnitedHealthcare Choice Plus',
  'Medicare Part B',
  'Humana Medicare Advantage',
  'Healthfirst Essential Plan',
];

export function InsuranceStep({ state, dispatch }: Props) {
  const [draft, setDraft] = useState(state.insurance);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft({ ...draft, [key]: value });
    if (errors[key as string]) {
      const next = { ...errors };
      delete next[key as string];
      setErrors(next);
    }
  }

  async function handleFiles(files: FileList | File[] | null) {
    if (!files) return;
    setUploading(true);
    const accepted: typeof draft.uploads = [...draft.uploads];
    for (const file of Array.from(files)) {
      if (!ALLOWED.includes(file.type)) {
        toast.error(`${file.name} skipped`, { description: 'Only PDF, JPG, and PNG are accepted.' });
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} skipped`, { description: 'File too large (max 25 MB).' });
        continue;
      }
      if (accepted.length >= 10) {
        toast.error('Upload limit reached', { description: 'Max 10 files per referral.' });
        break;
      }
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { url, contentType } = (await res.json()) as { url: string; contentType: string };
        accepted.push({ url, contentType, title: file.name });
        toast.success(`Uploaded ${file.name}`);
      } catch (e) {
        toast.error(`${file.name} failed to upload`, { description: String(e) });
      }
    }
    setDraft({ ...draft, uploads: accepted });
    setUploading(false);
  }

  function onNext() {
    const parsed = insuranceStepSchema.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] = i.message;
      setErrors(errs);
      return;
    }
    dispatch({ type: 'insurance', payload: parsed.data });
    dispatch({ type: 'goto', step: nextStep(state, 5) });
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <ShieldIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Insurance & documents</h2>
          <p className="text-sm text-neutral-500">Capture coverage upfront so the clinic doesn&apos;t have to chase it.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">
              Payor <span className="text-red-500">*</span>
            </label>
            <input
              value={draft.payor}
              onChange={(e) => update('payor', e.target.value)}
              placeholder="e.g. Aetna PPO"
              list="payors"
              className={`input ${errors.payor ? 'input-error' : ''}`}
            />
            <datalist id="payors">
              {COMMON_PAYORS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            {errors.payor && (
              <p className="err">
                <AlertCircleIcon className="h-3.5 w-3.5" />
                {errors.payor}
              </p>
            )}
          </div>

          <div>
            <label className="label">
              Member ID <span className="text-red-500">*</span>
            </label>
            <input
              value={draft.memberId}
              onChange={(e) => update('memberId', e.target.value)}
              placeholder="e.g. W123456789"
              className={`input font-mono ${errors.memberId ? 'input-error' : ''}`}
            />
            {errors.memberId && (
              <p className="err">
                <AlertCircleIcon className="h-3.5 w-3.5" />
                {errors.memberId}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="label">Group number <span className="text-neutral-400 font-normal">(optional)</span></label>
            <input
              value={draft.groupNumber ?? ''}
              onChange={(e) => update('groupNumber', e.target.value)}
              placeholder="e.g. 0123456"
              className="input font-mono max-w-xs"
            />
          </div>
        </div>

        {/* Dropzone */}
        <div>
          <label className="label">Attachments <span className="text-neutral-400 font-normal">(insurance card, prior films, prior reports)</span></label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
              dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-300 bg-neutral-50/50'
            }`}
          >
            <UploadIcon className="mb-2 h-8 w-8 text-neutral-400" />
            <div className="text-sm font-medium text-neutral-700">
              Drop files here or{' '}
              <label className="cursor-pointer text-indigo-600 hover:underline">
                browse
                <input
                  type="file"
                  accept={ALLOWED.join(',')}
                  multiple
                  onChange={(e) => void handleFiles(e.target.files)}
                  className="sr-only"
                />
              </label>
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              PDF / JPG / PNG • up to 25 MB each • 10 files max
            </div>
            {uploading && (
              <div className="mt-3 flex items-center gap-2 text-xs text-indigo-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                Uploading…
              </div>
            )}
          </div>

          {draft.uploads.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {draft.uploads.map((u) => (
                <li
                  key={u.url}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
                >
                  <CheckIcon className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  <FileIcon className="h-4 w-4 flex-shrink-0 text-neutral-400" />
                  <span className="flex-1 truncate text-neutral-800">{u.title ?? 'file'}</span>
                  <span className="text-xs text-neutral-500">{u.contentType}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, uploads: draft.uploads.filter((x) => x.url !== u.url) })
                    }
                    className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove file"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: 'goto', step: prevStep(state, 5) })}
          className="btn-secondary"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back
        </button>
        <button type="button" onClick={onNext} disabled={uploading} className="btn-primary">
          Next <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
