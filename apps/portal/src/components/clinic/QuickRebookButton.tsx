'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarIcon } from '@/components/ui/icons';
import { quickRebookAction } from './actions';

interface Props {
  serviceRequestId: string;
  /** ISO start of the missed appointment — used as basis for the new slot pick. */
  basisStart: string;
}

export function QuickRebookButton({ serviceRequestId, basisStart }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function rebook() {
    setBusy(true);
    const r = await quickRebookAction(serviceRequestId, basisStart);
    setBusy(false);
    if (r.ok) {
      toast.success('Rebooked', {
        description: r.newAppointmentStart
          ? `Patient + doctor notified. New time: ${new Date(r.newAppointmentStart).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`
          : 'Patient + doctor notified.',
      });
      router.refresh();
    } else {
      toast.error('Could not rebook', { description: r.error });
    }
  }

  return (
    <button
      type="button"
      onClick={() => void rebook()}
      disabled={busy}
      title="Find a free slot at the same weekday + time within the next 14 days and book it"
      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-hairline bg-paper px-3 py-1.5 text-[13px] font-medium text-graphite transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
    >
      <CalendarIcon className="h-3.5 w-3.5" />
      {busy ? 'Finding slot…' : 'Quick-rebook same time next week'}
    </button>
  );
}
