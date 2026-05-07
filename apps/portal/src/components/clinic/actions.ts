'use server';

import type { Appointment, Bundle, BundleEntry, Slot } from '@medplum/fhirtypes';
import { requireClinicStaff } from '@/lib/auth/guard';
import {
  withConcurrency,
  withTransactionConcurrency,
  PreconditionUnmetError,
  ifMatchProp,
} from '@/lib/fhir/concurrency';
import { log } from '@/lib/log';
import { auditLog } from '@/lib/audit';
import { formatDayTime } from '@/lib/format';
import { dispatchNotification, type NotifyPayload } from '@/lib/notify';
import type { MedplumClient } from '@medplum/core';
import type { Patient, Practitioner } from '@medplum/fhirtypes';

interface Result { ok: boolean; error?: string }

const FLAG_EXT_URL = 'http://vendo.local/ext/clinic-flags';
const TRIAGED_AT_EXT_URL = 'http://vendo.local/ext/triaged-at';

export type ClinicFlag = 'insuranceVerified' | 'patientCalled' | 'prepInstructionsSent' | 'arrivedToday';

/** Build a note entry with structured author so the read side can verify
 *  role server-side via Practitioner.identifier — no string-prefix trust.
 *  The author's display name is also snapshotted as `authorString` so the
 *  UI keeps showing the correct attribution even if the Practitioner is
 *  later deleted, renamed, or hidden from a viewer's AccessPolicy. */
function authoredNote(text: string, profileId: string, authorDisplay?: string) {
  const base = {
    text,
    time: new Date().toISOString(),
    authorReference: { reference: `Practitioner/${profileId}` },
  };
  if (authorDisplay && authorDisplay.trim()) {
    return {
      ...base,
      authorReference: { reference: `Practitioner/${profileId}`, display: authorDisplay.trim() },
    };
  }
  return base;
}

function displayNameOf(p: { name?: Array<{ given?: string[]; family?: string }> } | undefined): string | undefined {
  const n = p?.name?.[0];
  if (!n) return undefined;
  const given = (n.given ?? []).join(' ').trim();
  const family = n.family?.trim() ?? '';
  const full = `${given} ${family}`.trim();
  return full.length > 0 ? full : undefined;
}

function activeOnly(status: string | undefined): boolean {
  return status === 'active';
}

/**
 * Resolve the referrer + patient for a ServiceRequest and dispatch a
 * notification. Wrapped in `void` at every callsite — failures must
 * never roll back the surrounding clinical action. Reads run in
 * parallel; missing references degrade gracefully (template renders
 * with whatever's available; notify.ts logs the gap).
 */
async function notifyForSr(
  medplum: MedplumClient,
  actor: Practitioner,
  serviceRequestId: string,
  payload: NotifyPayload,
): Promise<void> {
  try {
    const sr = await medplum.readResource('ServiceRequest', serviceRequestId);
    const requesterId = sr.requester?.reference?.split('/')[1];
    const patientId = sr.subject?.reference?.split('/')[1];
    const [recipient, patient] = await Promise.all([
      requesterId ? safeRead<Practitioner>(medplum, 'Practitioner', requesterId) : Promise.resolve(undefined),
      patientId ? safeRead<Patient>(medplum, 'Patient', patientId) : Promise.resolve(undefined),
    ]);
    await dispatchNotification({ medplum, actor, recipient, patient, serviceRequest: sr, payload });
  } catch (err) {
    log.warn('notify_dispatch_failed', { sr: serviceRequestId, event: payload.event, error: String(err) });
  }
}

async function safeRead<T extends { resourceType: string }>(
  medplum: MedplumClient,
  resourceType: T['resourceType'],
  id: string,
): Promise<T | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await medplum.readResource(resourceType as any, id)) as unknown as T;
  } catch {
    return undefined;
  }
}

export async function confirmAppointmentAction(appointmentId: string): Promise<Result> {
  try {
    const { medplum, profile } = await requireClinicStaff();
    await withConcurrency(medplum, 'Appointment', appointmentId, (appt) =>
      appt.status === 'booked' ? appt : { ...appt, status: 'booked' },
    );
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `Appointment/${appointmentId}` }, subtype: 'confirm-appointment' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function cancelReferralAction(serviceRequestId: string, reason: string): Promise<Result> {
  try {
    const { medplum, profile } = await requireClinicStaff();
    const sr0 = await medplum.readResource('ServiceRequest', serviceRequestId);
    if (!activeOnly(sr0.status)) return { ok: false, error: 'Referral is not active.' };

    await withConcurrency(medplum, 'ServiceRequest', serviceRequestId, (sr) => ({
      ...sr,
      status: 'revoked',
      note: [...(sr.note ?? []), authoredNote(`Cancelled: ${reason}`, profile.id!, displayNameOf(profile))],
    }));

    try {
      const appts = await medplum.searchResources('Appointment', `based-on=ServiceRequest/${serviceRequestId}`);
      for (const a of appts) {
        if (!a.id) continue;
        if (a.status === 'booked' || a.status === 'proposed' || a.status === 'pending') {
          await withConcurrency(medplum, 'Appointment', a.id, (curr) => ({
            ...curr,
            status: 'cancelled',
            cancelationReason: { text: reason },
          }));
          const slotId = a.slot?.[0]?.reference?.split('/')[1];
          if (slotId) {
            try {
              await withConcurrency(medplum, 'Slot', slotId, (s) => ({ ...s, status: 'free' }));
            } catch {}
          }
        }
      }
    } catch {}
    log.info('referral_cancelled', { serviceRequestId });
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `ServiceRequest/${serviceRequestId}` }, subtype: 'cancel-referral' });
    void notifyForSr(medplum, profile, serviceRequestId, {
      event: 'cancelled',
      reason,
      cancelledBy: 'clinic',
    });
    return { ok: true };
  } catch (e) {
    log.error('referral_cancel_failed', { error: String(e) });
    return { ok: false, error: String(e) };
  }
}

export async function completeReferralAction(serviceRequestId: string): Promise<Result> {
  try {
    const { medplum, profile } = await requireClinicStaff();
    const sr0 = await medplum.readResource('ServiceRequest', serviceRequestId);
    if (sr0.status === 'revoked') return { ok: false, error: 'Referral was cancelled' };
    if (sr0.status === 'completed') return { ok: true };

    await withConcurrency(medplum, 'ServiceRequest', serviceRequestId, (sr) => ({
      ...sr,
      status: 'completed',
    }));

    try {
      const appts = await medplum.searchResources('Appointment', `based-on=ServiceRequest/${serviceRequestId}`);
      for (const a of appts) {
        if (!a.id) continue;
        if (a.status === 'booked') {
          await withConcurrency(medplum, 'Appointment', a.id, (curr) => ({
            ...curr,
            status: 'fulfilled',
          }));
        }
      }
    } catch {}
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `ServiceRequest/${serviceRequestId}` }, subtype: 'complete-referral' });
    // PACS link (if any) is captured as an SR note via attachImagingLinkAction
    // earlier in the flow; pull from the freshest SR read so the email links
    // straight to images when available.
    let pacsLink: string | undefined;
    try {
      const fresh = await medplum.readResource('ServiceRequest', serviceRequestId);
      const m = (fresh.note ?? [])
        .map((n) => (n.text ?? '').match(/Images available:\s*(https?:\/\/[^\s<>"]+)/i))
        .filter((x): x is RegExpMatchArray => x !== null)
        .pop();
      pacsLink = m?.[1]?.replace(/[.,);\]]+$/, '');
    } catch {}
    void notifyForSr(medplum, profile, serviceRequestId, { event: 'completed', pacsLink });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Final stage: report delivered, referral fully closed out.
 *  Sets extension flag so deriveStage moves to 'closed' (without conflating
 *  with status='revoked' which is reserved for cancellations). */
export async function closeReferralAction(serviceRequestId: string): Promise<Result> {
  const CLOSED_OUT_EXT_URL = 'http://vendo.local/ext/closed-out';
  try {
    const { medplum, profile } = await requireClinicStaff();
    const sr0 = await medplum.readResource('ServiceRequest', serviceRequestId);
    if (sr0.status === 'revoked') return { ok: false, error: 'Referral was cancelled' };
    const already = sr0.extension?.some((x) => x.url === CLOSED_OUT_EXT_URL && x.valueBoolean === true);
    if (already) return { ok: true };

    await withConcurrency(medplum, 'ServiceRequest', serviceRequestId, (sr) => {
      const others = (sr.extension ?? []).filter((x) => x.url !== CLOSED_OUT_EXT_URL);
      return {
        ...sr,
        status: 'completed',
        extension: [...others, { url: CLOSED_OUT_EXT_URL, valueBoolean: true }],
        note: [...(sr.note ?? []), authoredNote('Report delivered — referral closed', profile.id!, displayNameOf(profile))],
      };
    });
    log.info('referral_closed', { serviceRequestId });
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `ServiceRequest/${serviceRequestId}` }, subtype: 'close-referral' });
    return { ok: true };
  } catch (e) {
    log.error('referral_close_failed', { error: String(e) });
    return { ok: false, error: String(e) };
  }
}

export async function attachImagingLinkAction(serviceRequestId: string, url: string): Promise<Result> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'URL must be http(s)' };
  } catch {
    return { ok: false, error: 'Not a valid URL' };
  }
  try {
    const { medplum, profile } = await requireClinicStaff();
    await withConcurrency(medplum, 'ServiceRequest', serviceRequestId, (sr) => {
      // Idempotent: skip if this link already in notes (re-checked under If-Match).
      const already = (sr.note ?? []).some((n) => (n.text ?? '').includes(`Images available: ${url}`));
      if (already) return sr;
      return {
        ...sr,
        note: [...(sr.note ?? []), authoredNote(`Images available: ${url}`, profile.id!, displayNameOf(profile))],
      };
    });
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `ServiceRequest/${serviceRequestId}` }, subtype: 'attach-imaging-link' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Schedule a referral with optimistic concurrency.
 *
 *  Two-phase to guarantee single-booking even though Medplum 5.x runs
 *  `Bundle.type='transaction'` non-atomically (per-entry isolation, no
 *  rollback on partial failure):
 *    1. Lock the Slot (free→busy) via per-resource ifMatch — only one
 *       caller wins; others observe `status=busy` on retry-read and short-
 *       circuit with `slot-taken`.
 *    2. Once locked, create the Appointment and append the SR note in a
 *       follow-up bundle. If the follow-up fails after the slot is locked,
 *       we compensate by freeing the slot back so it doesn't become an
 *       orphan reservation.
 */
export async function scheduleAppointmentAction(serviceRequestId: string, slotId: string): Promise<Result> {
  let slotLocked = false;
  try {
    const { medplum, profile } = await requireClinicStaff();

    // Cheap read-only precondition checks first — fail fast before mutating.
    const sr0 = await medplum.readResource('ServiceRequest', serviceRequestId);
    if (!activeOnly(sr0.status)) return { ok: false, error: 'Referral is not active' };
    // Reject double-booking: if this SR already has an active appointment,
    // refuse rather than create a parallel one and burn a second slot. Reschedule
    // is the correct path for changing an existing booking.
    const existingAppts: Appointment[] = await medplum
      .searchResources('Appointment', `based-on=ServiceRequest/${serviceRequestId}&_count=20`)
      .catch(() => [] as Appointment[]);
    const hasActive = existingAppts.some(
      (a) => a.status === 'booked' || a.status === 'pending' || a.status === 'proposed',
    );
    if (hasActive) return { ok: false, error: 'This referral already has an active appointment — use Reschedule.' };
    const slot0: Slot = await medplum.readResource('Slot', slotId);
    if (slot0.status !== 'free') return { ok: false, error: 'Slot already taken' };
    if (!slot0.start || !slot0.end) return { ok: false, error: 'Slot missing start/end' };

    // Phase 1: atomic slot lock via withConcurrency (ifMatch + retry).
    const lockedSlot = await withConcurrency(medplum, 'Slot', slotId, (s) => {
      if (s.status !== 'free') {
        // The mutator runs once per attempt against fresh state — if status
        // is anything other than 'free', another caller already grabbed it.
        throw new PreconditionUnmetError('slot-taken', 'Slot already taken');
      }
      return { ...s, status: 'busy' as const };
    });
    slotLocked = true;

    // Phase 2: appointment + SR note via Bundle. SR PUT carries ifMatch so
    // concurrent flag/note writes aren't clobbered; on a versionId mismatch
    // we retry inside withTransactionConcurrency by re-reading SR.
    const apptUrn = `urn:uuid:${globalThis.crypto.randomUUID()}`;
    const noteText = `Scheduled for ${formatDayTime(lockedSlot.start!)}`;
    const requesterRef = sr0.requester?.reference ?? '';
    const subjectRef = sr0.subject?.reference ?? '';

    await withTransactionConcurrency(medplum, async () => {
      const sr = await medplum.readResource('ServiceRequest', serviceRequestId);
      // Booking implies the clinic has engaged — stamp triagedAt if absent so
      // the SR's stage stays >= 'triaged' even if the booking is later
      // cancelled or no-showed. Idempotent: skip when already set.
      const hasTriagedAt = (sr.extension ?? []).some(
        (x) => x.url === TRIAGED_AT_EXT_URL && Boolean(x.valueDateTime),
      );
      const triagedAtToAdd = hasTriagedAt
        ? []
        : [{ url: TRIAGED_AT_EXT_URL, valueDateTime: new Date().toISOString() }];
      return {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: [
          {
            fullUrl: apptUrn,
            request: { method: 'POST', url: 'Appointment' },
            resource: {
              resourceType: 'Appointment',
              status: 'booked',
              slot: [{ reference: `Slot/${lockedSlot.id}` }],
              start: lockedSlot.start!,
              end: lockedSlot.end!,
              participant: [
                ...(subjectRef ? [{ actor: { reference: subjectRef }, status: 'accepted' as const }] : []),
                ...(requesterRef ? [{ actor: { reference: requesterRef }, status: 'accepted' as const }] : []),
              ],
              basedOn: [{ reference: `ServiceRequest/${sr.id}` }],
            },
          },
          {
            request: {
              method: 'PUT',
              url: `ServiceRequest/${sr.id}`,
              ...ifMatchProp(sr.meta?.versionId),
            },
            resource: {
              ...sr,
              extension: [...(sr.extension ?? []), ...triagedAtToAdd],
              note: [...(sr.note ?? []), authoredNote(noteText, profile.id!, displayNameOf(profile))],
            },
          },
        ] as BundleEntry[],
      };
    });

    log.info('referral_scheduled', { serviceRequestId, slotId });
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `ServiceRequest/${serviceRequestId}` }, subtype: 'schedule-appointment' });
    void notifyForSr(medplum, profile, serviceRequestId, {
      event: 'scheduled',
      startIso: lockedSlot.start!,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof PreconditionUnmetError) {
      log.warn('referral_schedule_precondition', { serviceRequestId, slotId, code: e.code });
      return { ok: false, error: e.message };
    }
    // Compensating release: if we locked the slot but the follow-up failed,
    // free it back so the slot doesn't become an unreachable reservation.
    if (slotLocked) {
      try {
        const { medplum } = await requireClinicStaff();
        await withConcurrency(medplum, 'Slot', slotId, (s) => ({ ...s, status: 'free' as const }));
        log.warn('referral_schedule_rolled_back', { serviceRequestId, slotId });
      } catch (rollbackErr) {
        log.error('referral_schedule_rollback_failed', { serviceRequestId, slotId, error: String(rollbackErr) });
      }
    }
    log.error('referral_schedule_failed', { error: String(e) });
    return { ok: false, error: String(e) };
  }
}

/** Reschedule an appointment with optimistic concurrency.
 *
 *  Same two-phase pattern as scheduleAppointmentAction: lock the new slot
 *  first (so two concurrent reschedules can't both grab it), then update
 *  Appointment + free old slot + append SR note in a follow-up bundle.
 *  Compensates by re-freeing the new slot if the follow-up step fails.
 */
export async function rescheduleAppointmentAction(
  appointmentId: string,
  newSlotId: string,
  // Phase 4.5 — required reason for the audit trail. Server enforces a
  // minimum length so a UI bypass with an empty reason is rejected; the
  // text rides along on the SR note ("Rescheduled to … — reason: …")
  // so the referrer sees why their patient's appointment moved.
  reason: string,
): Promise<Result> {
  if (!reason || reason.trim().length < 3) {
    return { ok: false, error: 'Reschedule reason is required' };
  }
  let newSlotLocked = false;
  try {
    const { medplum, profile } = await requireClinicStaff();

    // Cheap read-only precondition checks.
    const newSlot0: Slot = await medplum.readResource('Slot', newSlotId);
    if (newSlot0.status !== 'free') return { ok: false, error: 'New slot already taken' };
    if (!newSlot0.start || !newSlot0.end) return { ok: false, error: 'Slot missing start/end' };

    // Validate the underlying SR is still active — rescheduling a
    // cancelled/completed referral makes no clinical sense and would leave
    // the new slot orphaned to a closed pipeline item.
    const apptForCheck = await medplum.readResource('Appointment', appointmentId);
    const srIdForCheck = apptForCheck.basedOn?.[0]?.reference?.split('/')[1];
    if (srIdForCheck) {
      const srForCheck = await medplum.readResource('ServiceRequest', srIdForCheck);
      if (!activeOnly(srForCheck.status)) return { ok: false, error: 'Referral is not active' };
    }

    // Validate that the new slot's modality matches the old one. A pre-paid
    // MRI cannot be moved into an X-ray slot — clinical safety + billing.
    const oldSlotIdForCheck = apptForCheck.slot?.[0]?.reference?.split('/')[1];
    if (oldSlotIdForCheck) {
      try {
        const oldSlotForCheck = await medplum.readResource('Slot', oldSlotIdForCheck);
        const oldSchedRef = oldSlotForCheck.schedule?.reference;
        const newSchedRef = newSlot0.schedule?.reference;
        if (oldSchedRef && newSchedRef && oldSchedRef !== newSchedRef) {
          // Different schedule resources may still belong to the same modality;
          // compare via Schedule.serviceCategory to be sure.
          const [oldSched, newSched] = await Promise.all([
            medplum.readResource('Schedule', oldSchedRef.split('/')[1]!),
            medplum.readResource('Schedule', newSchedRef.split('/')[1]!),
          ]);
          const oldCat = oldSched.serviceCategory?.[0]?.coding?.[0]?.code ?? '';
          const newCat = newSched.serviceCategory?.[0]?.coding?.[0]?.code ?? '';
          if (oldCat && newCat && oldCat !== newCat) {
            return { ok: false, error: `Modality mismatch: cannot move from ${oldCat} to ${newCat}` };
          }
        }
      } catch {
        // If old-slot lookup fails (deleted, AccessPolicy block), skip the
        // modality check rather than block reschedule entirely.
      }
    }

    // Phase 1: lock the new slot via per-resource ifMatch.
    const lockedNewSlot = await withConcurrency(medplum, 'Slot', newSlotId, (s) => {
      if (s.status !== 'free') throw new PreconditionUnmetError('slot-taken', 'New slot already taken');
      return { ...s, status: 'busy' as const };
    });
    newSlotLocked = true;

    // Phase 2: free old slot, point Appointment at new slot, append SR note.
    const appt0 = await medplum.readResource('Appointment', appointmentId);
    const oldSlotRef = appt0.slot?.[0]?.reference;
    const oldSlotId = oldSlotRef?.split('/')[1];
    if (oldSlotId) {
      try {
        await withConcurrency(medplum, 'Slot', oldSlotId, (s) => ({ ...s, status: 'free' as const }));
      } catch (e) {
        // Old-slot revert failure isn't fatal — log and continue. Worst case
        // is a stale 'busy' slot we can clean up later.
        log.warn('reschedule_old_slot_free_failed', { oldSlotId, error: String(e) });
      }
    }

    const srRef = appt0.basedOn?.[0]?.reference;
    const srId = srRef?.split('/')[1];
    const noteText = `Rescheduled to ${formatDayTime(lockedNewSlot.start!)} — reason: ${reason.trim()}`;

    await withTransactionConcurrency(medplum, async () => {
      const appt = await medplum.readResource('Appointment', appointmentId);
      const sr = srId ? await medplum.readResource('ServiceRequest', srId) : undefined;
      const entries: BundleEntry[] = [
        {
          request: {
            method: 'PUT',
            url: `Appointment/${appt.id}`,
            ...ifMatchProp(appt.meta?.versionId),
          },
          resource: {
            ...appt,
            slot: [{ reference: `Slot/${lockedNewSlot.id}` }],
            start: lockedNewSlot.start!,
            end: lockedNewSlot.end!,
            status: 'booked',
          },
        },
      ];
      if (sr) {
        entries.push({
          request: {
            method: 'PUT',
            url: `ServiceRequest/${sr.id}`,
            ...ifMatchProp(sr.meta?.versionId),
          },
          resource: { ...sr, note: [...(sr.note ?? []), authoredNote(noteText, profile.id!, displayNameOf(profile))] },
        });
      }
      return { resourceType: 'Bundle', type: 'transaction', entry: entries };
    });

    log.info('appointment_rescheduled', { appointmentId, newSlotId });
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `Appointment/${appointmentId}` }, subtype: 'reschedule-appointment' });
    if (srId) {
      void notifyForSr(medplum, profile, srId, {
        event: 'rescheduled',
        startIso: lockedNewSlot.start!,
        previousStartIso: appt0.start ?? undefined,
        reason: reason.trim(),
      });
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof PreconditionUnmetError) {
      log.warn('appointment_reschedule_precondition', { appointmentId, newSlotId, code: e.code });
      return { ok: false, error: e.message };
    }
    if (newSlotLocked) {
      try {
        const { medplum } = await requireClinicStaff();
        await withConcurrency(medplum, 'Slot', newSlotId, (s) => ({ ...s, status: 'free' as const }));
        log.warn('appointment_reschedule_rolled_back', { appointmentId, newSlotId });
      } catch (rollbackErr) {
        log.error('appointment_reschedule_rollback_failed', { appointmentId, newSlotId, error: String(rollbackErr) });
      }
    }
    log.error('appointment_reschedule_failed', { error: String(e) });
    return { ok: false, error: String(e) };
  }
}

/**
 * Phase 2.5 — mark a scheduled appointment as no-show.
 *
 * Flips Appointment.status to 'noshow', frees the booked Slot back to free
 * so the time can be rebooked, appends an audit-style note on the
 * ServiceRequest, and queues a referrer notification (stub today, real
 * email once Phase 1.9 SMTP lands). The SR remains `active` so deriveStage
 * falls back to 'triaged' — the front desk must rebook or cancel.
 *
 * Ordering choice: we update Appointment + SR atomically first, *then*
 * free the slot best-effort. If slot-free fails after a successful flip,
 * the patient is still correctly marked no-show; a stale 'busy' slot is a
 * smaller problem (cleanable) than a half-applied no-show.
 */
export async function markNoShowAction(serviceRequestId: string, appointmentId: string): Promise<Result> {
  try {
    const { medplum, profile } = await requireClinicStaff();

    const sr0 = await medplum.readResource('ServiceRequest', serviceRequestId);
    if (!activeOnly(sr0.status)) return { ok: false, error: 'Referral not active' };

    const appt0 = await medplum.readResource('Appointment', appointmentId);
    if (appt0.status !== 'booked') {
      return { ok: false, error: `Cannot mark no-show: appointment is ${appt0.status}` };
    }
    // Defensive cross-check: the appointment we're flipping must actually
    // belong to this referral. Prevents a spoofed appointmentId from
    // mutating an unrelated patient's booking.
    const appointmentSrId = appt0.basedOn?.[0]?.reference?.split('/')[1];
    if (appointmentSrId && appointmentSrId !== serviceRequestId) {
      return { ok: false, error: 'Appointment does not belong to this referral' };
    }

    const slotRef = appt0.slot?.[0]?.reference;
    const slotId = slotRef?.split('/')[1];
    const startIso = appt0.start;
    const noteText = startIso
      ? `Marked no-show for ${formatDayTime(startIso)}`
      : 'Marked no-show';

    // Phase 1: flip Appointment + append SR note in one transaction with
    // ifMatch on both, so a concurrent reschedule cannot race us into an
    // inconsistent state.
    //
    // Critical: also stamp `triagedAt` if not already set. After no-show the
    // active appointment is gone from the row, so deriveStage falls through
    // to the flag/triagedAt check. Without this stamp, an SR with no clinic
    // flags would regress to 'submitted' instead of staying in 'triaged' —
    // misleading the inbox into thinking the clinic hasn't engaged yet.
    await withTransactionConcurrency(medplum, async () => {
      const appt = await medplum.readResource('Appointment', appointmentId);
      const sr = await medplum.readResource('ServiceRequest', serviceRequestId);
      const hasTriagedAt = (sr.extension ?? []).some(
        (x) => x.url === TRIAGED_AT_EXT_URL && Boolean(x.valueDateTime),
      );
      const triagedAtToAdd = hasTriagedAt
        ? []
        : [{ url: TRIAGED_AT_EXT_URL, valueDateTime: new Date().toISOString() }];
      const entries: BundleEntry[] = [
        {
          request: {
            method: 'PUT',
            url: `Appointment/${appt.id}`,
            ...ifMatchProp(appt.meta?.versionId),
          },
          resource: { ...appt, status: 'noshow' },
        },
        {
          request: {
            method: 'PUT',
            url: `ServiceRequest/${sr.id}`,
            ...ifMatchProp(sr.meta?.versionId),
          },
          resource: {
            ...sr,
            extension: [...(sr.extension ?? []), ...triagedAtToAdd],
            note: [...(sr.note ?? []), authoredNote(noteText, profile.id!, displayNameOf(profile))],
          },
        },
      ];
      return { resourceType: 'Bundle', type: 'transaction', entry: entries };
    });

    // Phase 2: best-effort slot release. A failure here is logged but does
    // NOT roll back the no-show flip — the clinical record is more important.
    if (slotId) {
      try {
        await withConcurrency(medplum, 'Slot', slotId, (s) => ({ ...s, status: 'free' as const }));
      } catch (e) {
        log.warn('noshow_slot_free_failed', { slotId, error: String(e) });
      }
    }

    // Notify the referring doctor with a brand-aligned email. Fire-and-
    // forget; failures stay in the log + audit trail and don't surface to
    // the clinic-staff user — the no-show flip is more important than the
    // email succeeding.
    void notifyForSr(medplum, profile, serviceRequestId, {
      event: 'no-show',
      appointmentStartIso: startIso ?? undefined,
    });

    log.info('appointment_no_show', { serviceRequestId, appointmentId });
    auditLog({
      medplum,
      agent: profile,
      action: 'U',
      target: { reference: `Appointment/${appointmentId}` },
      subtype: 'mark-no-show',
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof PreconditionUnmetError) {
      log.warn('appointment_no_show_precondition', { appointmentId, code: e.code });
      return { ok: false, error: e.message };
    }
    log.error('appointment_no_show_failed', { error: String(e) });
    return { ok: false, error: String(e) };
  }
}

export async function setFlagAction(serviceRequestId: string, flag: ClinicFlag, value: boolean): Promise<Result> {
  try {
    const { medplum, profile } = await requireClinicStaff();
    const sr0 = await medplum.readResource('ServiceRequest', serviceRequestId);
    if (!activeOnly(sr0.status)) return { ok: false, error: 'Referral not active' };

    await withConcurrency(medplum, 'ServiceRequest', serviceRequestId, (sr) => {
      const nonFlagExts = (sr.extension ?? []).filter(
        (x) => x.url !== FLAG_EXT_URL && x.url !== TRIAGED_AT_EXT_URL,
      );
      const flagsExt = (sr.extension ?? []).find((x) => x.url === FLAG_EXT_URL);
      const inner = (flagsExt?.extension ?? []).filter((x) => x.url !== flag);
      inner.push({ url: flag, valueBoolean: value });

      // Sticky triagedAt: once set, never cleared. Setting any flag to true
      // (or unsetting one when others are still on) preserves the marker.
      const existingTriagedAt = (sr.extension ?? []).find((x) => x.url === TRIAGED_AT_EXT_URL);
      const anyTrueAfter = inner.some((e) => e.valueBoolean === true);
      const triagedAtExt = existingTriagedAt
        ? existingTriagedAt
        : anyTrueAfter
          ? { url: TRIAGED_AT_EXT_URL, valueDateTime: new Date().toISOString() }
          : undefined;

      return {
        ...sr,
        extension: [
          ...nonFlagExts,
          { url: FLAG_EXT_URL, extension: inner },
          ...(triagedAtExt ? [triagedAtExt] : []),
        ],
        note: [...(sr.note ?? []), authoredNote(`${value ? 'Marked' : 'Unmarked'} ${flag}`, profile.id!, displayNameOf(profile))],
      };
    });
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `ServiceRequest/${serviceRequestId}` }, subtype: `flag-${flag}-${value ? 'on' : 'off'}` });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function addInternalNoteAction(serviceRequestId: string, text: string): Promise<Result> {
  if (!text.trim()) return { ok: false, error: 'Note is empty' };
  try {
    const { medplum, profile } = await requireClinicStaff();
    await withConcurrency(medplum, 'ServiceRequest', serviceRequestId, (sr) => ({
      ...sr,
      note: [...(sr.note ?? []), authoredNote(text.trim(), profile.id!, displayNameOf(profile))],
    }));
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `ServiceRequest/${serviceRequestId}` }, subtype: 'add-internal-note' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Internal-only clinic note — never shown to the referring doctor. Used for
 *  shift-handoff context like "Patient seemed confused, called twice". The
 *  text is stored with a `[Internal]` prefix so the read side can filter it
 *  out for non-clinic viewers without a schema change. */
export async function addClinicPrivateNoteAction(serviceRequestId: string, text: string): Promise<Result> {
  if (!text.trim()) return { ok: false, error: 'Note is empty' };
  try {
    const { medplum, profile } = await requireClinicStaff();
    const prefixed = `[Internal] ${text.trim()}`;
    await withConcurrency(medplum, 'ServiceRequest', serviceRequestId, (sr) => ({
      ...sr,
      note: [...(sr.note ?? []), authoredNote(prefixed, profile.id!, displayNameOf(profile))],
    }));
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `ServiceRequest/${serviceRequestId}` }, subtype: 'add-clinic-private-note' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Quick-rebook: when a slot was a no-show, find an open slot at the same
 *  weekday + time on the next occurrence and book it. Falls back to nearest
 *  same-time-of-day in the next 14 days if exact slot is not free. */
export async function quickRebookAction(
  serviceRequestId: string,
  basisStartIso: string,
): Promise<Result & { newAppointmentStart?: string }> {
  if (!basisStartIso) return { ok: false, error: 'No basis time' };
  try {
    const { medplum } = await requireClinicStaff();
    const sr = await medplum.readResource('ServiceRequest', serviceRequestId);
    const modality = sr.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code;
    if (!modality) return { ok: false, error: 'Study modality not set on referral' };

    // Resolve the modality's Schedule then search for a matching free Slot
    // in the next 14 days, preferring same weekday + time-of-day to the
    // missed appointment.
    const sched = await medplum.searchResources(
      'Schedule',
      `service-category=http://vendo.local/study|${modality}&_count=1`,
    );
    const schedule = sched[0];
    if (!schedule?.id) return { ok: false, error: 'No schedule found for this study type' };

    const basis = new Date(basisStartIso);
    const targetDow = basis.getUTCDay();
    const targetHM = basis.toISOString().slice(11, 16); // HH:MM in UTC

    const fromIso = new Date().toISOString();
    const toIso = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const slots = await medplum.searchResources(
      'Slot',
      `schedule=Schedule/${schedule.id}&status=free&start=ge${fromIso}&start=le${toIso}&_count=400&_sort=start`,
    );

    // Pick best match: same DOW + same HH:MM. Fallback: same HH:MM, any DOW.
    // Fallback: just the earliest free slot.
    type SlotLite = { id: string; start: string; end: string };
    const candidates = slots
      .filter((s): s is Slot & { id: string; start: string; end: string } => !!s.id && !!s.start && !!s.end)
      .map((s): SlotLite => ({ id: s.id, start: s.start, end: s.end }));

    const match =
      candidates.find((s) => {
        const d = new Date(s.start);
        return d.getUTCDay() === targetDow && s.start.slice(11, 16) === targetHM;
      }) ??
      candidates.find((s) => s.start.slice(11, 16) === targetHM) ??
      candidates[0];

    if (!match) return { ok: false, error: 'No free slots in the next 14 days' };

    const result = await scheduleAppointmentAction(serviceRequestId, match.id);
    if (!result.ok) return result;
    return { ok: true, newAppointmentStart: match.start };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
