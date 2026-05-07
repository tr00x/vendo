'use client';

import type { Dispatch } from 'react';
import type { WizardAction, WizardState } from './types';
import { modalityMeta, formatDateTime } from '@/lib/format';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  UserIcon,
  StethoscopeIcon,
  ShieldIcon,
  CalendarIcon,
  ArrowRightIcon,
} from '@/components/ui/icons';

interface Props {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  onSubmit: () => void;
  submitting: boolean;
}

export function ReviewStep({ state, dispatch, onSubmit, submitting }: Props) {
  const m = modalityMeta(state.study.modality);
  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <CheckCircleIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Review &amp; submit</h2>
          <p className="text-sm text-neutral-500">One last check before sending this referral to the clinic.</p>
        </div>
      </div>

      <div className="space-y-4">
        <Section
          title="Schedule"
          icon={CalendarIcon}
          color="sky"
          onEdit={() => dispatch({ type: 'goto', step: 0 })}
        >
          <Row k="Modality" v={`${m.label} (${m.description})`} />
          <Row
            k="Time"
            v={state.slot.start ? formatDateTime(state.slot.start) : 'Clinic will call patient to schedule'}
          />
        </Section>

        <Section
          title="Patient"
          icon={UserIcon}
          color="indigo"
          onEdit={() => dispatch({ type: 'goto', step: 1 })}
        >
          <Row k="Name" v={`${state.patient.given} ${state.patient.family}`} />
          <Row k="Date of birth" v={state.patient.birthDate} />
          <Row k="Sex" v={state.patient.sex} />
          <Row k="Phone" v={state.patient.phone} />
          {state.patient.email && <Row k="Email" v={state.patient.email} />}
          <Row
            k="Patient match"
            v={state.patient.existingPatientId ? 'Existing patient (selected from match)' : 'New patient'}
          />
        </Section>

        <Section
          title="Study"
          icon={StethoscopeIcon}
          color="violet"
          onEdit={() => dispatch({ type: 'goto', step: 2 })}
        >
          <Row k="Body part" v={state.study.bodyPart} />
          <Row k="Reason" v={state.study.reason} />
          {state.study.notes && <Row k="Notes" v={state.study.notes} multiline />}
        </Section>

        {state.study.modality === 'MRI' && state.mriSafety && (
          <Section
            title="MRI safety"
            icon={StethoscopeIcon}
            color="rose"
            onEdit={() => dispatch({ type: 'goto', step: 3 })}
          >
            <Row k="Pacemaker" v={state.mriSafety.pacemaker} />
            <Row
              k="Metal implants"
              v={
                state.mriSafety.metalImplants === 'yes' && state.mriSafety.metalImplantType
                  ? `yes — ${state.mriSafety.metalImplantType}`
                  : state.mriSafety.metalImplants
              }
            />
            <Row k="Claustrophobia" v={state.mriSafety.claustrophobia} />
            <Row
              k="IV contrast"
              v={
                state.mriSafety.withContrast === 'yes' && state.mriSafety.gfr != null
                  ? `yes — eGFR ${state.mriSafety.gfr}`
                  : state.mriSafety.withContrast
              }
            />
          </Section>
        )}

        {state.study.modality === 'XRAY' && state.pregnancy && state.pregnancy.pregnant !== 'unknown' && (
          <Section
            title="Pregnancy screening"
            icon={StethoscopeIcon}
            color="rose"
            onEdit={() => dispatch({ type: 'goto', step: 4 })}
          >
            <Row k="Pregnant" v={state.pregnancy.pregnant} />
            {state.pregnancy.lmpDate && <Row k="LMP" v={state.pregnancy.lmpDate} />}
            {state.pregnancy.pregnant === 'yes' && state.pregnancy.overrideReason && (
              <Row k="Override reason" v={state.pregnancy.overrideReason} multiline />
            )}
          </Section>
        )}

        <Section
          title="Insurance"
          icon={ShieldIcon}
          color="emerald"
          onEdit={() => dispatch({ type: 'goto', step: 5 })}
        >
          <Row k="Payor" v={state.insurance.payor} />
          <Row k="Member ID" v={state.insurance.memberId} mono />
          {state.insurance.groupNumber && <Row k="Group #" v={state.insurance.groupNumber} mono />}
          <Row
            k="Documents"
            v={`${state.insurance.uploads.length} ${state.insurance.uploads.length === 1 ? 'file' : 'files'}`}
          />
        </Section>
      </div>

      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
          <div className="text-sm text-emerald-900">
            <div className="font-medium">After you submit:</div>
            <ul className="mt-1 list-disc pl-5 text-xs text-emerald-800 space-y-0.5">
              <li>You'll get an email confirmation immediately</li>
              <li>The clinic is notified and will contact your patient</li>
              <li>You can track status anytime from your dashboard</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: 'goto', step: 5 })}
          className="btn-secondary"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back
        </button>
        <button
          type="button"
          disabled={submitting}
          aria-busy={submitting}
          aria-disabled={submitting}
          onClick={onSubmit}
          className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 focus-visible:!outline-emerald-600 disabled:!cursor-not-allowed disabled:!opacity-60"
        >
          {submitting ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Submitting referral…
            </>
          ) : (
            <>
              Submit referral <ArrowRightIcon className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </>
  );
}

function Section({
  title,
  icon: Icon,
  color,
  onEdit,
  children,
}: {
  title: string;
  icon: (p: { className?: string }) => React.ReactNode;
  color: 'indigo' | 'violet' | 'emerald' | 'sky' | 'rose';
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const c = {
    indigo: 'bg-indigo-50 text-indigo-600',
    violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    rose: 'bg-rose-50 text-rose-600',
  }[color];
  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-md ${c}`}>
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          Edit
        </button>
      </header>
      <dl className="grid grid-cols-1 gap-y-2 p-4 text-sm sm:grid-cols-[10rem_1fr]">{children}</dl>
    </section>
  );
}

function Row({ k, v, mono, multiline }: { k: string; v: string; mono?: boolean; multiline?: boolean }) {
  return (
    <>
      <dt className="text-neutral-500">{k}</dt>
      <dd
        className={`${mono ? 'font-mono text-xs' : ''} ${multiline ? 'whitespace-pre-wrap' : ''} text-neutral-900`}
      >
        {v}
      </dd>
    </>
  );
}
