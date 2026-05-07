'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckIcon } from '@/components/ui/icons';
import { setFlagAction, type ClinicFlag } from './actions';

interface Props {
  serviceRequestId: string;
  initial: Record<ClinicFlag, boolean>;
}

const ITEMS: Array<{ key: ClinicFlag; label: string; description: string }> = [
  { key: 'insuranceVerified', label: 'Insurance verified', description: 'Coverage confirmed with payor.' },
  { key: 'patientCalled', label: 'Patient called', description: 'Spoke to patient to confirm.' },
  { key: 'prepInstructionsSent', label: 'Prep instructions sent', description: 'Pre-imaging guidance emailed/texted.' },
  { key: 'arrivedToday', label: 'Patient arrived', description: 'Checked in at the desk.' },
];

export function QuickFlags({ serviceRequestId, initial }: Props) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<ClinicFlag | null>(null);

  async function toggle(flag: ClinicFlag) {
    const next = !state[flag];
    setState({ ...state, [flag]: next }); // optimistic
    setBusy(flag);
    const r = await setFlagAction(serviceRequestId, flag, next);
    setBusy(null);
    if (!r.ok) {
      setState({ ...state, [flag]: !next });
      toast.error('Could not update flag', { description: r.error });
    } else {
      router.refresh();
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ITEMS.map((it) => {
        const active = state[it.key];
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => void toggle(it.key)}
            disabled={busy !== null}
            title={it.description}
            className={`flex items-start gap-2 rounded-md border p-2.5 text-left transition disabled:opacity-50 ${
              active
                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/15'
                : 'border-hairline bg-paper hover:border-ink/30'
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border ${
                active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-hairline bg-bone'
              }`}
            >
              {active && <CheckIcon className="h-3 w-3" />}
            </span>
            <div>
              <div className={`text-[12px] font-medium ${active ? 'text-emerald-900 dark:text-emerald-200' : 'text-ink'}`}>
                {it.label}
              </div>
              <div className="text-[11px] leading-tight text-smoke">{it.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
