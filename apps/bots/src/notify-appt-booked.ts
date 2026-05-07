import type { MedplumClient } from '@medplum/core';
import type { Appointment, Patient, Practitioner } from '@medplum/fhirtypes';
import { sendEmail } from './lib/email.js';
import { apptBookedEmail } from './lib/templates.js';
import { botLog } from './lib/redact.js';

interface BotEvent {
  resource: Appointment;
}

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const appt = event.resource;
  if (appt.status !== 'booked') return;

  const recipients: string[] = [];
  let modality = 'study';
  for (const p of appt.participant ?? []) {
    if (!p.actor?.reference) continue;
    if (p.actor.reference.startsWith('Practitioner/')) {
      const pract = (await medplum.readReference(p.actor)) as Practitioner;
      const e = pract.telecom?.find((t) => t.system === 'email')?.value;
      if (e) recipients.push(e);
    } else if (p.actor.reference.startsWith('Patient/')) {
      const pt = (await medplum.readReference(p.actor)) as Patient;
      const e = pt.telecom?.find((t) => t.system === 'email')?.value;
      if (e) recipients.push(e);
    }
  }
  if (appt.basedOn?.[0]?.reference?.startsWith('ServiceRequest/')) {
    try {
      const sr = await medplum.readReference(appt.basedOn[0]);
      if (sr.resourceType === 'ServiceRequest') {
        modality =
          sr.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code ?? modality;
      }
    } catch {
      // optional
    }
  }

  if (recipients.length === 0) {
    botLog('skip_no_recipients', { appointmentId: appt.id });
    return;
  }
  const email = apptBookedEmail({ modality, start: appt.start ?? 'TBD' });
  await sendEmail({ to: recipients, ...email });
  botLog('appt_booked_notified', { appointmentId: appt.id, recipients: recipients.length });
}
