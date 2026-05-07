'use server';

import { requireSession } from '@/lib/auth/guard';
import { withConcurrency } from '@/lib/fhir/concurrency';
import { log } from '@/lib/log';
import { auditLog } from '@/lib/audit';
import { dispatchNotification } from '@/lib/notify';

interface Result { ok: boolean; error?: string }

/** Snapshot the author's display name into `authorReference.display` so the
 *  cross-portal timeline keeps showing the right name even after the
 *  Practitioner is deleted, renamed, or hidden by AccessPolicy. */
function authoredNote(text: string, profileId: string, authorDisplay?: string) {
  const ref = authorDisplay && authorDisplay.trim().length > 0
    ? { reference: `Practitioner/${profileId}`, display: authorDisplay.trim() }
    : { reference: `Practitioner/${profileId}` };
  return {
    text,
    time: new Date().toISOString(),
    authorReference: ref,
  };
}

function displayNameOf(p: { name?: Array<{ given?: string[]; family?: string }> } | undefined): string | undefined {
  const n = p?.name?.[0];
  if (!n) return undefined;
  const given = (n.given ?? []).join(' ').trim();
  const family = n.family?.trim() ?? '';
  const full = `${given} ${family}`.trim();
  return full.length > 0 ? full : undefined;
}

export async function cancelMyReferralAction(serviceRequestId: string, reason: string): Promise<Result> {
  // Phase 4.6 — referrer-side withdraw mirrors clinic cancel and must
  // carry a reason. Server-enforced so a UI bypass with empty reason is
  // rejected; the text rides on the SR note for the clinic timeline.
  if (!reason || reason.trim().length < 3) {
    return { ok: false, error: 'Reason is required to withdraw a referral' };
  }
  try {
    const { medplum, profile } = await requireSession();
    // Pre-read once to gate on status — withConcurrency below re-reads on retry,
    // so the actual revocation also runs under If-Match.
    const sr0 = await medplum.readResource('ServiceRequest', serviceRequestId);
    if (sr0.status !== 'active') return { ok: false, error: 'Referral is not active' };

    await withConcurrency(medplum, 'ServiceRequest', serviceRequestId, (sr) => ({
      ...sr,
      status: 'revoked',
      note: [...(sr.note ?? []), authoredNote(`Withdrawn by referrer: ${reason || '—'}`, profile.id!, displayNameOf(profile))],
    }));

    try {
      const appts = await medplum.searchResources('Appointment', `based-on=ServiceRequest/${serviceRequestId}`);
      for (const a of appts) {
        if (!a.id) continue;
        if (a.status === 'booked' || a.status === 'proposed' || a.status === 'pending') {
          await withConcurrency(medplum, 'Appointment', a.id, (curr) => ({
            ...curr,
            status: 'cancelled',
          }));
          const slotRef = a.slot?.[0]?.reference;
          const slotId = slotRef?.split('/')[1];
          if (slotId) {
            try {
              await withConcurrency(medplum, 'Slot', slotId, (s) => ({ ...s, status: 'free' }));
            } catch {}
          }
        }
      }
    } catch {}
    log.info('referrer_self_cancel', { serviceRequestId });
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `ServiceRequest/${serviceRequestId}` }, subtype: 'referrer-cancel' });
    // Notify the referrer themself (confirmation receipt). The clinic gets
    // notified by the SR.note timeline when staff opens the detail page;
    // a separate clinic-broadcast email is overkill at v1.0 (≤10 users,
    // staff actively monitor the inbox throughout the day).
    void (async () => {
      try {
        const fresh = await medplum.readResource('ServiceRequest', serviceRequestId);
        const patientId = fresh.subject?.reference?.split('/')[1];
        const patient = patientId ? await medplum.readResource('Patient', patientId).catch(() => undefined) : undefined;
        await dispatchNotification({
          medplum,
          actor: profile,
          recipient: profile,
          patient,
          serviceRequest: fresh,
          payload: { event: 'cancelled', reason: reason.trim(), cancelledBy: 'referrer' },
        });
      } catch (e) {
        log.warn('referrer_cancel_notify_failed', { error: String(e) });
      }
    })();
    return { ok: true };
  } catch (e) {
    log.error('referrer_self_cancel_failed', { error: String(e) });
    return { ok: false, error: String(e) };
  }
}

export async function addReferrerCommentAction(serviceRequestId: string, text: string): Promise<Result> {
  if (!text.trim()) return { ok: false, error: 'Comment is empty' };
  try {
    const { medplum, profile } = await requireSession();
    await withConcurrency(medplum, 'ServiceRequest', serviceRequestId, (sr) => ({
      ...sr,
      note: [...(sr.note ?? []), authoredNote(text.trim(), profile.id!, displayNameOf(profile))],
    }));
    auditLog({ medplum, agent: profile, action: 'U', target: { reference: `ServiceRequest/${serviceRequestId}` }, subtype: 'referrer-comment' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
