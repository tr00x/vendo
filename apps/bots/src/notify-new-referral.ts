import type { MedplumClient } from '@medplum/core';
import type { Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { sendEmail } from './lib/email.js';
import { newReferralEmail } from './lib/templates.js';
import { botLog } from './lib/redact.js';

interface BotEvent {
  resource: ServiceRequest;
  contentType?: string;
  secrets?: Record<string, { name: string; valueString: string }>;
}

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const sr = event.resource;
  if (!sr.requester?.reference || !sr.subject?.reference) return;

  const requester = (await medplum.readReference(sr.requester)) as Practitioner;
  const patient = (await medplum.readReference(sr.subject)) as Patient;

  const referrerEmail = requester.telecom?.find((t) => t.system === 'email')?.value;
  if (!referrerEmail) {
    botLog('skip_no_email', { practitionerId: requester.id });
    return;
  }
  const referrerName = `${requester.name?.[0]?.given?.[0] ?? ''} ${requester.name?.[0]?.family ?? ''}`.trim();
  const modality = sr.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code ?? 'study';
  const patientFirst = patient.name?.[0]?.given?.[0] ?? 'patient';

  const email = newReferralEmail({ referrerName, modality, patientFirst });
  const adminEmail = event.secrets?.['ADMIN_EMAIL']?.valueString;
  const recipients = [referrerEmail, ...(adminEmail ? [adminEmail] : [])];

  await sendEmail({ to: recipients, ...email });
  botLog('new_referral_notified', { serviceRequestId: sr.id, recipients: recipients.length });
}
