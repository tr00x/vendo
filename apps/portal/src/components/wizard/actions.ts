'use server';

import type { Bundle, BundleEntry } from '@medplum/fhirtypes';
import { requireClinicStaff, requireSession } from '@/lib/auth/guard';
import { findExistingPatient } from '@/lib/fhir/dedupe';
import { buildReferralBundle } from '@/lib/fhir/bundle';
import { wizardSchema, pregnancyScreeningRequired } from '@/lib/fhir/schemas';
import { withConcurrency, PreconditionUnmetError } from '@/lib/fhir/concurrency';
import { auditLog } from '@/lib/audit';
import { log } from '@/lib/log';
import type { WizardState } from './types';

export interface PatientMatch {
  id: string;
  given: string;
  family: string;
  birthDate: string;
}

export async function findExistingPatientsAction(q: {
  family: string;
  given: string;
  birthDate: string;
  phone?: string;
}): Promise<PatientMatch[]> {
  const { medplum } = await requireSession();
  const matches = await findExistingPatient(medplum, q);
  return matches
    .filter((p) => p.id)
    .map((p) => ({
      id: p.id!,
      given: p.name?.[0]?.given?.join(' ') ?? '',
      family: p.name?.[0]?.family ?? '',
      birthDate: p.birthDate ?? '',
    }));
}

export type SubmitResult =
  | { ok: true; serviceRequestId: string }
  | {
      ok: false;
      code?: 'slot-taken' | 'mri-unsafe' | 'pregnancy-unsafe' | 'unknown';
      error?: string;
    };

export async function submitReferral(state: WizardState): Promise<SubmitResult> {
  const { medplum, profile } = await requireSession();
  const parsed = wizardSchema.safeParse(state);
  if (!parsed.success) {
    log.warn('wizard_invalid', { issues: parsed.error.issues.length });
    // Map the failing path to the same error code the UI uses to navigate
    // back to the offending step. Without this, a forged/missing
    // mriSafety or pregnancy block returns a generic "invalid fields"
    // and the wizard sits on Review with no way back to the conditional
    // step the user has never seen. Order matters: pick the first issue
    // that actually points at a known section.
    const firstIssue = parsed.error.issues[0];
    const top = firstIssue?.path[0];
    if (top === 'mriSafety') {
      return {
        ok: false,
        code: 'mri-unsafe',
        error: firstIssue?.message ?? 'MRI safety questionnaire required',
      };
    }
    if (top === 'pregnancy') {
      return {
        ok: false,
        code: 'pregnancy-unsafe',
        error: firstIssue?.message ?? 'Pregnancy screening required',
      };
    }
    return { ok: false, code: 'unknown', error: 'Form has invalid fields' };
  }
  if (!profile.id) {
    return { ok: false, code: 'unknown', error: 'No profile id' };
  }

  // Defense-in-depth: re-check MRI safety hard-blocks server-side. The client
  // disables the Next button under the same conditions, but a forged payload
  // that bypassed the UI must still be rejected here. Schema's superRefine
  // catches missing GFR / required fields; this catches the policy decisions
  // (pacemaker yes, low GFR with contrast).
  if (parsed.data.study.modality === 'MRI' && parsed.data.mriSafety) {
    const s = parsed.data.mriSafety;
    if (s.pacemaker === 'yes') {
      log.warn('mri_unsafe_blocked', { reason: 'pacemaker' });
      return {
        ok: false,
        code: 'mri-unsafe',
        error: 'Pacemaker / implanted cardiac device is contraindicated for MRI.',
      };
    }
    if (s.withContrast === 'yes' && s.gfr != null && s.gfr < 30) {
      log.warn('mri_unsafe_blocked', { reason: 'low-gfr', gfr: s.gfr });
      return {
        ok: false,
        code: 'mri-unsafe',
        error: 'IV contrast contraindicated when eGFR < 30 mL/min/1.73m².',
      };
    }
  }

  // Phase 2.2 server-side pregnancy gate. UI disables Next without an
  // override reason; this defends the same policy against forged payloads.
  if (
    pregnancyScreeningRequired({
      modality: parsed.data.study.modality,
      sex: parsed.data.patient.sex,
      birthDate: parsed.data.patient.birthDate,
    }) &&
    parsed.data.pregnancy
  ) {
    const p = parsed.data.pregnancy;
    if (p.pregnant === 'yes' && p.overrideReason.trim().length === 0) {
      log.warn('pregnancy_unsafe_blocked', { reason: 'no-override-reason' });
      return {
        ok: false,
        code: 'pregnancy-unsafe',
        error: 'Pregnant patient requires a documented clinical reason to proceed with X-ray.',
      };
    }
  }

  const slotId = parsed.data.slot.slotId;
  let slotLocked = false;

  try {
    // Phase 1: when a slot is selected, atomically grab it via per-resource
    // ifMatch (`withConcurrency`). Medplum 5.x runs `transaction` Bundles
    // non-atomically, so embedding the Slot PUT alongside the SR/Appointment
    // POSTs would NOT prevent double-booking on its own — only the per-Slot
    // ifMatch lock does. We compensate by freeing the slot back if Phase 2
    // fails after the lock succeeded.
    if (slotId) {
      await withConcurrency(medplum, 'Slot', slotId, (s) => {
        if (s.status !== 'free') {
          throw new PreconditionUnmetError('slot-taken', 'Slot taken');
        }
        return { ...s, status: 'busy' as const };
      });
      slotLocked = true;
    }

    // Phase 2: create Patient + SR + Appointment + DocRef. We don't pass
    // slotSnapshot any more — Phase 1 already locked the slot, and the
    // wizard's bundle just references it by id.
    const bundle = buildReferralBundle({
      practitionerId: profile.id!,
      formInput: parsed.data,
      existingPatientId: parsed.data.patient.existingPatientId,
    });
    const result: Bundle = await medplum.executeBatch(bundle);
    const srEntry = (result.entry ?? []).find(
      (e: BundleEntry) => e.resource?.resourceType === 'ServiceRequest',
    );
    const sr =
      srEntry?.resource?.resourceType === 'ServiceRequest' ? srEntry.resource : undefined;
    if (!sr?.id) return { ok: false, code: 'unknown', error: 'Server did not return ServiceRequest id' };
    log.info('referral_created', { serviceRequestId: sr.id });
    auditLog({ medplum, agent: profile, action: 'C', target: { reference: `ServiceRequest/${sr.id}` }, subtype: 'submit-referral' });
    return { ok: true, serviceRequestId: sr.id };
  } catch (err) {
    if (err instanceof PreconditionUnmetError && err.code === 'slot-taken') {
      return { ok: false, code: 'slot-taken', error: 'Slot taken' };
    }
    if (slotLocked && slotId) {
      try {
        await withConcurrency(medplum, 'Slot', slotId, (s) => ({ ...s, status: 'free' as const }));
        log.warn('referral_rolled_back_slot', { slotId });
      } catch (rollbackErr) {
        log.error('referral_rollback_failed', { slotId, error: String(rollbackErr) });
      }
    }
    log.error('referral_failed', { error: String(err) });
    return { ok: false, code: 'unknown', error: 'Submit failed' };
  }
}

/**
 * Clinic-side variant of submitReferral. Same wizard state, same bundle
 * shape — the only differences are the auth gate (ClinicStaff only),
 * the audit subtype, and the absence of an outbound notify_referrer
 * email (the requester is staff, who is also the recipient — no point
 * mailing yourself). Returns the same result shape so WizardShell can
 * branch on a single discriminator.
 */
export async function submitClinicBooking(state: WizardState): Promise<SubmitResult> {
  const { medplum, profile } = await requireClinicStaff();
  const parsed = wizardSchema.safeParse(state);
  if (!parsed.success) {
    log.warn('clinic_booking_invalid', { issues: parsed.error.issues.length });
    const firstIssue = parsed.error.issues[0];
    const top = firstIssue?.path[0];
    if (top === 'mriSafety') {
      return {
        ok: false,
        code: 'mri-unsafe',
        error: firstIssue?.message ?? 'MRI safety questionnaire required',
      };
    }
    if (top === 'pregnancy') {
      return {
        ok: false,
        code: 'pregnancy-unsafe',
        error: firstIssue?.message ?? 'Pregnancy screening required',
      };
    }
    return { ok: false, code: 'unknown', error: 'Form has invalid fields' };
  }
  if (!profile.id) {
    return { ok: false, code: 'unknown', error: 'No profile id' };
  }

  // Same defense-in-depth gates as submitReferral — identical clinical
  // policy regardless of who's filling the form.
  if (parsed.data.study.modality === 'MRI' && parsed.data.mriSafety) {
    const s = parsed.data.mriSafety;
    if (s.pacemaker === 'yes') {
      return {
        ok: false,
        code: 'mri-unsafe',
        error: 'Pacemaker / implanted cardiac device is contraindicated for MRI.',
      };
    }
    if (s.withContrast === 'yes' && s.gfr != null && s.gfr < 30) {
      return {
        ok: false,
        code: 'mri-unsafe',
        error: 'IV contrast contraindicated when eGFR < 30 mL/min/1.73m².',
      };
    }
  }
  if (
    pregnancyScreeningRequired({
      modality: parsed.data.study.modality,
      sex: parsed.data.patient.sex,
      birthDate: parsed.data.patient.birthDate,
    }) &&
    parsed.data.pregnancy
  ) {
    const p = parsed.data.pregnancy;
    if (p.pregnant === 'yes' && p.overrideReason.trim().length === 0) {
      return {
        ok: false,
        code: 'pregnancy-unsafe',
        error: 'Pregnant patient requires a documented clinical reason to proceed with X-ray.',
      };
    }
  }

  const slotId = parsed.data.slot.slotId;
  let slotLocked = false;

  try {
    if (slotId) {
      await withConcurrency(medplum, 'Slot', slotId, (s) => {
        if (s.status !== 'free') {
          throw new PreconditionUnmetError('slot-taken', 'Slot taken');
        }
        return { ...s, status: 'busy' as const };
      });
      slotLocked = true;
    }

    // requester = the ClinicStaff Practitioner who's filling the form.
    // That's intentional — the inbox view sorts by requester so a walk-in
    // booked by front-desk staff shows up under their name, not as an orphan.
    const bundle = buildReferralBundle({
      practitionerId: profile.id!,
      formInput: parsed.data,
      existingPatientId: parsed.data.patient.existingPatientId,
    });
    const result: Bundle = await medplum.executeBatch(bundle);
    // Medplum may return either {entry[].resource} (full representation) or
    // {entry[].response.location: "ServiceRequest/{id}"} (status-only). The
    // referrer flow has historically gotten the former; if a different
    // Prefer header / project setting is in play we now also look at
    // response.location so a status-only reply still works.
    const entries = result.entry ?? [];
    const srEntry = entries.find((e: BundleEntry) => {
      if (e.resource?.resourceType === 'ServiceRequest') return true;
      const loc = e.response?.location ?? '';
      return loc.startsWith('ServiceRequest/');
    });
    const srIdFromResource =
      srEntry?.resource?.resourceType === 'ServiceRequest' ? srEntry.resource.id : undefined;
    const srIdFromLocation = srEntry?.response?.location?.split('/')[1];
    const srId = srIdFromResource ?? srIdFromLocation;
    if (!srId) {
      log.error('clinic_booking_no_sr_id', {
        entries: entries.map((e) => ({
          status: e.response?.status ?? null,
          location: e.response?.location ?? null,
          rt: e.resource?.resourceType ?? null,
          outcome: (e.response?.outcome as { issue?: Array<{ diagnostics?: string }> } | undefined)
            ?.issue?.[0]?.diagnostics ?? null,
        })),
      });
      // Free the slot lock — bundle Phase 2 partly succeeded but the SR
      // POST failed, which leaves an orphan {Patient, Appointment, DocRef}
      // pinned to a now-busy Slot. cleanup-orphans.ts removes the orphan
      // resources; releasing the slot here keeps the schedule honest.
      if (slotLocked && slotId) {
        try {
          await withConcurrency(medplum, 'Slot', slotId, (s) => ({
            ...s,
            status: 'free' as const,
          }));
          log.warn('clinic_booking_freed_slot_after_no_sr', { slotId });
        } catch (rollbackErr) {
          log.error('clinic_booking_no_sr_rollback_failed', {
            slotId,
            error: String(rollbackErr),
          });
        }
      }
      return { ok: false, code: 'unknown', error: 'Server did not return ServiceRequest id' };
    }
    log.info('clinic_booking_created', { serviceRequestId: srId, bookedBy: profile.id });
    auditLog({
      medplum,
      agent: profile,
      action: 'C',
      target: { reference: `ServiceRequest/${srId}` },
      subtype: 'submit-clinic-booking',
    });
    return { ok: true, serviceRequestId: srId };
  } catch (err) {
    if (err instanceof PreconditionUnmetError && err.code === 'slot-taken') {
      return { ok: false, code: 'slot-taken', error: 'Slot taken' };
    }
    if (slotLocked && slotId) {
      try {
        await withConcurrency(medplum, 'Slot', slotId, (s) => ({ ...s, status: 'free' as const }));
        log.warn('clinic_booking_rolled_back_slot', { slotId });
      } catch (rollbackErr) {
        log.error('clinic_booking_rollback_failed', { slotId, error: String(rollbackErr) });
      }
    }
    log.error('clinic_booking_failed', { error: String(err) });
    return { ok: false, code: 'unknown', error: 'Submit failed' };
  }
}
