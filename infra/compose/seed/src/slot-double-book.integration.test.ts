/**
 * Phase 0.2 — Slot conditional booking under concurrent load.
 *
 * Reproduces the worst-case scheduling race: N clinic-staff (or referrer +
 * clinic) sessions click "Book" on the same Slot simultaneously. Without
 * a per-resource `If-Match` lock on the Slot's `meta.versionId`, all N
 * writes succeed and N Appointments end up referencing the same Slot —
 * silent double-booking that surfaces only when patients show up.
 *
 * Design note (CRITICAL — discovered during this test's first run): Medplum
 * 5.x runs `Bundle.type='transaction'` non-atomically. Embedding the Slot
 * PUT alongside the Appointment POST in a single Bundle does NOT prevent
 * double-booking — the Slot PUT is rejected (412) but the Appointment POST
 * still creates an orphan record. So Phase 0.2's lock MUST live in a
 * dedicated single-resource update (`updateResource` with `If-Match`),
 * which we wrap in `withConcurrency` in the portal's action code.
 *
 * Acceptance per PROD_LAUNCH.md:
 *   "10 parallel scheduleAppointmentAction for same slot → 1 success,
 *    9 return { ok: false, error: 'Slot already taken' }."
 *
 * This test exercises the underlying primitive — `updateResource` with
 * `If-Match` — under concurrent load. It does NOT call the Next.js Server
 * Action directly (which would require a running portal); instead it
 * mimics the lock primitive that `scheduleAppointmentAction` relies on.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { adminClient } from './test-helpers.js';

const PARALLELISM = 10;

interface LockOutcome {
  attempt: number;
  ok: boolean;
  status?: number | undefined;
  errorText?: string | undefined;
}

describe('Phase 0.2 — Slot conditional booking under concurrent locks', () => {
  let practitionerId: string;
  let scheduleId: string;
  let slotId: string;

  beforeAll(async () => {
    const { client: admin } = await adminClient();

    const practitioner = (await admin.createResource({
      resourceType: 'Practitioner',
      name: [{ family: 'SlotRace', given: ['Test'] }],
    } as Practitioner)) as Practitioner;
    practitionerId = practitioner.id!;

    const schedule = (await admin.createResource({
      resourceType: 'Schedule',
      active: true,
      actor: [{ reference: `Practitioner/${practitionerId}` }],
      serviceCategory: [
        { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/service-category', code: '17' }] },
      ],
    } as Schedule)) as Schedule;
    scheduleId = schedule.id!;

    const start = new Date(Date.now() + 7 * 86_400_000);
    start.setUTCHours(15, 0, 0, 0);
    const slot = (await admin.createResource({
      resourceType: 'Slot',
      schedule: { reference: `Schedule/${scheduleId}` },
      status: 'free',
      start: start.toISOString(),
      end: new Date(start.getTime() + 30 * 60_000).toISOString(),
    } as Slot)) as Slot;
    slotId = slot.id!;
  });

  afterAll(async () => {
    const { client: admin } = await adminClient();
    try { await admin.deleteResource('Slot', slotId); } catch {}
    try { await admin.deleteResource('Schedule', scheduleId); } catch {}
    try { await admin.deleteResource('Practitioner', practitionerId); } catch {}
  });

  it(`exactly 1 of ${PARALLELISM} parallel locks wins; others get 412`, async () => {
    const { client: admin } = await adminClient();
    // Read once, share the same versionId across all attempts. By
    // construction only the first commit will satisfy `If-Match`.
    const captured = (await admin.readResource('Slot', slotId)) as Slot;
    expect(captured.status).toBe('free');
    const capturedVersionId = captured.meta?.versionId;
    expect(capturedVersionId).toBeTruthy();

    const attempts = Array.from({ length: PARALLELISM }, (_, i) => i + 1);
    const results = await Promise.all(
      attempts.map(async (attempt): Promise<LockOutcome> => {
        try {
          await admin.updateResource(
            { ...captured, status: 'busy' },
            { headers: { 'If-Match': `W/"${capturedVersionId}"` } },
          );
          return { attempt, ok: true };
        } catch (err) {
          const e = err as {
            status?: number;
            outcome?: { issue?: Array<{ details?: { text?: string }; code?: string }> };
          };
          return {
            attempt,
            ok: false,
            status: e.status,
            errorText: e.outcome?.issue?.[0]?.details?.text ?? e.outcome?.issue?.[0]?.code,
          };
        }
      }),
    );

    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);

    // eslint-disable-next-line no-console
    console.log(
      `[slot-lock] winners=${winners.length} losers=${losers.length}`,
      'sample-loser=', JSON.stringify({ status: losers[0]?.status, err: losers[0]?.errorText?.slice(0, 80) }),
    );

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(PARALLELISM - 1);

    for (const l of losers) {
      const isPrecondition =
        l.status === 412 ||
        l.status === 409 ||
        (l.errorText?.toLowerCase() ?? '').includes('precondition') ||
        (l.errorText?.toLowerCase() ?? '').includes('processing') ||
        (l.errorText?.toLowerCase() ?? '').includes('conflict') ||
        (l.errorText?.toLowerCase() ?? '').includes('version');
      expect(
        isPrecondition,
        `attempt ${l.attempt} failed for the wrong reason: status=${l.status} err=${l.errorText}`,
      ).toBe(true);
    }

    // Final state: slot is busy, exactly once.
    const finalSlot = (await admin.readResource('Slot', slotId)) as Slot;
    expect(finalSlot.status).toBe('busy');
    expect(finalSlot.meta?.versionId).not.toBe(capturedVersionId);
  });

  it('a stale ifMatch retry observes status=busy and gives up cleanly', async () => {
    // Free the slot back so this test starts fresh.
    const { client: admin } = await adminClient();
    const cur = (await admin.readResource('Slot', slotId)) as Slot;
    if (cur.status === 'busy') {
      await admin.updateResource({ ...cur, status: 'free' });
    }

    // Read with one versionId, then mutate from another path to bump the
    // version, then attempt the stale-ifMatch update. Should be rejected.
    const stale = (await admin.readResource('Slot', slotId)) as Slot;
    const fresh = (await admin.readResource('Slot', slotId)) as Slot;
    await admin.updateResource({ ...fresh, status: 'busy' }); // v+1, status=busy

    let threwShape:
      | { status?: number; outcome?: { issue?: Array<{ code?: string; details?: { text?: string } }> } }
      | undefined;
    try {
      await admin.updateResource(
        { ...stale, status: 'busy' },
        { headers: { 'If-Match': `W/"${stale.meta?.versionId}"` } },
      );
    } catch (err) {
      threwShape = err as typeof threwShape;
    }
    expect(threwShape).toBeTruthy();
    // Medplum can surface a precondition failure either as `status=412` on
    // the thrown error or as an OperationOutcome with `issue.code='processing'`
    // / `issue.details.text='Precondition Failed'`. We accept any of those.
    const status = threwShape?.status;
    const issue = threwShape?.outcome?.issue?.[0];
    const indicatesPrecondition =
      status === 412 ||
      status === 409 ||
      issue?.code === 'processing' ||
      issue?.code === 'conflict' ||
      (issue?.details?.text?.toLowerCase().includes('precondition') ?? false);
    expect(
      indicatesPrecondition,
      `expected precondition failure but got status=${status} issue=${JSON.stringify(issue)}`,
    ).toBe(true);
  });
});
