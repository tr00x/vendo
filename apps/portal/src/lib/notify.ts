import type { MedplumClient } from '@medplum/core';
import type { Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { log } from '@/lib/log';
import { auditLog } from '@/lib/audit';
import { getEmailTransport } from '@/lib/email/transport';
import {
  BRAND,
  cancelledTemplate,
  completedTemplate,
  noShowTemplate,
  rescheduledTemplate,
  scheduledTemplate,
  type EmailContent,
} from '@/lib/email/templates';

export type NotifyEvent = 'scheduled' | 'rescheduled' | 'cancelled' | 'completed' | 'no-show';

export interface NotifyContext {
  medplum: MedplumClient;
  /** Logged-in actor — used as the AuditEvent agent. */
  actor: Practitioner;
  /** Recipient practitioner (the referrer) and patient — used to render the email. */
  recipient: Practitioner | undefined;
  patient: Patient | undefined;
  serviceRequest: ServiceRequest;
  /** Per-event payload. See dispatchNotification() for which fields each event uses. */
  payload: NotifyPayload;
}

export type NotifyPayload =
  | { event: 'scheduled'; startIso: string }
  | { event: 'rescheduled'; startIso: string; previousStartIso: string | undefined; reason: string }
  | { event: 'cancelled'; reason: string; cancelledBy: 'clinic' | 'referrer' }
  | { event: 'completed'; pacsLink: string | undefined }
  | { event: 'no-show'; appointmentStartIso: string | undefined };

interface SafePeople {
  doctor: { given: string; family: string };
  patient: { given: string; family: string };
  email: string | undefined;
  doctorDisplay: string;
}

function pickPeople(ctx: NotifyContext): SafePeople {
  const dn = ctx.recipient?.name?.[0];
  const pn = ctx.patient?.name?.[0];
  const doctor = {
    given: (dn?.given?.[0] ?? '').trim(),
    family: (dn?.family ?? '').trim(),
  };
  const patient = {
    given: (pn?.given?.[0] ?? '').trim(),
    family: (pn?.family ?? '').trim(),
  };
  return {
    doctor,
    patient,
    email: ctx.recipient?.telecom?.find((t) => t.system === 'email')?.value,
    doctorDisplay: `${doctor.given} ${doctor.family}`.trim() || 'Referring doctor',
  };
}

function pickStudy(sr: ServiceRequest): { modality: 'MRI' | 'XRAY' | 'ARK'; bodyPart: string } {
  const code = sr.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code;
  const modality = code === 'MRI' || code === 'XRAY' || code === 'ARK' ? code : 'MRI';
  // SR.code.text is "MRI — Right knee" by convention (see bundle.ts); strip
  // the modality prefix so the body part stands alone in the template.
  const text = sr.code?.text ?? '';
  const dashIdx = text.indexOf('—');
  const bodyPart = dashIdx >= 0 ? text.slice(dashIdx + 1).trim() : text.trim();
  return { modality, bodyPart };
}

function renderContent(ctx: NotifyContext, people: SafePeople): EmailContent | null {
  const study = pickStudy(ctx.serviceRequest);
  const srId = ctx.serviceRequest.id ?? '';
  const base = { doctor: people.doctor, patient: people.patient, study, serviceRequestId: srId };
  switch (ctx.payload.event) {
    case 'scheduled':
      return scheduledTemplate({ ...base, startIso: ctx.payload.startIso });
    case 'rescheduled':
      return rescheduledTemplate({
        ...base,
        startIso: ctx.payload.startIso,
        previousStartIso: ctx.payload.previousStartIso,
        reason: ctx.payload.reason,
      });
    case 'cancelled':
      return cancelledTemplate({
        ...base,
        reason: ctx.payload.reason,
        cancelledBy: ctx.payload.cancelledBy,
      });
    case 'completed':
      return completedTemplate({ ...base, pacsLink: ctx.payload.pacsLink });
    case 'no-show':
      return noShowTemplate({ ...base, appointmentStartIso: ctx.payload.appointmentStartIso });
  }
}

/**
 * Dispatch a referrer notification. Renders the brand-aligned email
 * template, hands it to the configured transport (stub by default), and
 * writes an AuditEvent so the action is traceable regardless of whether
 * the email actually went out. Never throws — clinical actions must not
 * be rolled back by a notification failure.
 */
export async function dispatchNotification(ctx: NotifyContext): Promise<void> {
  const people = pickPeople(ctx);
  const event = ctx.payload.event;
  const srRef = `ServiceRequest/${ctx.serviceRequest.id ?? ''}`;
  try {
    const content = renderContent(ctx, people);
    if (!content) {
      log.warn('notify_render_skipped', { event, sr: srRef });
      return;
    }
    if (!people.email) {
      // No address on file — log enough to recover what would have been
      // sent and audit the intent. Common at v1.0 for synthetic/seed data.
      log.warn('notify_no_recipient_email', {
        event,
        sr: srRef,
        subject: content.subject,
        preview: content.text.slice(0, 240),
      });
      auditLog({
        medplum: ctx.medplum,
        agent: ctx.actor,
        action: 'E',
        target: { reference: srRef },
        subtype: `notify-${event}-no-recipient`,
        outcome: '4',
      });
      return;
    }
    const transport = getEmailTransport();
    const result = await transport.send({
      to: people.email,
      toName: people.doctorDisplay,
      replyTo: BRAND.supportEmail,
      content,
    });
    log.info('notify_sent', {
      event,
      sr: srRef,
      transport: transport.name,
      messageId: result.id ?? null,
      ok: result.ok,
    });
    auditLog({
      medplum: ctx.medplum,
      agent: ctx.actor,
      action: 'E',
      target: { reference: srRef },
      subtype: `notify-${event}`,
      outcome: result.ok ? '0' : '4',
    });
  } catch (err) {
    log.error('notify_failed', { event, sr: srRef, error: String(err) });
  }
}

// ── Backwards-compatible thin wrapper for the existing markNoShowAction ──
// (the original notifyReferrer signature, kept so no caller has to change
// in this same change). New callers should prefer dispatchNotification().

export interface NotifyArgs {
  medplum: MedplumClient;
  actor: Practitioner;
  recipient: Practitioner | undefined;
  event: 'no-show' | 'rescheduled' | 'cancelled' | 'completed';
  serviceRequestRef: string;
  message: string;
}

export async function notifyReferrer(args: NotifyArgs): Promise<void> {
  // This wrapper exists for legacy callers that don't yet pass the full
  // context. It logs + audits the same way dispatchNotification does, but
  // doesn't render an email because it lacks Patient/SR. New callers
  // should use dispatchNotification(). Tracked for migration.
  try {
    log.info('notify_referrer_legacy', {
      event: args.event,
      sr: args.serviceRequestRef,
      to: args.recipient?.telecom?.find((t) => t.system === 'email')?.value ?? '<unknown>',
      preview: args.message.slice(0, 240),
    });
    auditLog({
      medplum: args.medplum,
      agent: args.actor,
      action: 'E',
      target: { reference: args.serviceRequestRef },
      subtype: `notify-referrer-${args.event}`,
      outcome: '0',
    });
  } catch (err) {
    log.error('notify_referrer_failed', { error: String(err), event: args.event });
  }
}
