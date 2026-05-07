import type { MedplumClient } from '@medplum/core';
import type { Appointment, Patient, Practitioner } from '@medplum/fhirtypes';
import { sendEmail } from './lib/email.js';
import { apptCancelledEmail } from './lib/templates.js';
import { botLog } from './lib/redact.js';

interface BotEvent {
  resource: Appointment;
}

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const appt = event.resource;
  if (appt.status !== 'cancelled') return;

  const recipients: string[] = [];
  for (const p of appt.participant ?? []) {
    if (!p.actor?.reference) continue;
    try {
      const ref = await medplum.readReference(p.actor);
      if (ref.resourceType === 'Practitioner' || ref.resourceType === 'Patient') {
        const r = ref as Practitioner | Patient;
        const e = r.telecom?.find((t) => t.system === 'email')?.value;
        if (e) recipients.push(e);
      }
    } catch {
      // ignore unreadable
    }
  }
  if (recipients.length === 0) {
    botLog('skip_no_recipients', { appointmentId: appt.id });
    return;
  }
  const email = apptCancelledEmail({ modality: 'study', start: appt.start ?? 'TBD' });
  await sendEmail({ to: recipients, ...email });
  botLog('appt_cancelled_notified', { appointmentId: appt.id, recipients: recipients.length });
}
