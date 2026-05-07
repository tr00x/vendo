import type { MedplumClient } from '@medplum/core';
import type { Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { sendEmail } from './lib/email.js';
import { imagesReadyEmail } from './lib/templates.js';
import { botLog } from './lib/redact.js';

interface BotEvent {
  resource: ServiceRequest;
}

const URL_RE = /https?:\/\/\S+/;

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const sr = event.resource;
  const text = (sr.note ?? []).map((n) => n.text ?? '').join('\n');
  const match = text.match(URL_RE);
  if (!match) {
    botLog('skip_no_url_in_note', { serviceRequestId: sr.id });
    return;
  }
  if (!sr.requester?.reference) return;
  const requester = (await medplum.readReference(sr.requester)) as Practitioner;
  const email = requester.telecom?.find((t) => t.system === 'email')?.value;
  if (!email) return;

  const modality =
    sr.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code ?? 'study';
  const rendered = imagesReadyEmail({ modality, deeplink: match[0] });
  await sendEmail({ to: [email], ...rendered });
  botLog('images_ready_notified', { serviceRequestId: sr.id });
}
