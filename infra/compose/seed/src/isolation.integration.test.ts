import { describe, it, expect, beforeAll } from 'vitest';
import { makeReferrer, createReferralFor, type ReferrerCtx, type ReferralBundle } from './test-helpers.js';

const PHI_TYPES = ['Patient', 'ServiceRequest', 'Appointment', 'DocumentReference'] as const;
type PhiType = (typeof PHI_TYPES)[number];

function pickId(
  data: ReferralBundle,
  rt: PhiType,
): string {
  const id =
    rt === 'Patient' ? data.patient.id :
    rt === 'ServiceRequest' ? data.serviceRequest.id :
    rt === 'Appointment' ? data.appointment.id :
    data.documentReference.id;
  if (!id) throw new Error(`Test data missing ${rt}.id`);
  return id;
}

function deniedStatusOf(err: unknown): string | number | undefined {
  const e = err as { outcome?: { issue?: Array<{ code?: string }> }; status?: number };
  return e?.outcome?.issue?.[0]?.code ?? e?.status;
}

describe('cross-referrer isolation (HIPAA gate)', () => {
  let alice: ReferrerCtx;
  let bob: ReferrerCtx;
  let aliceData: ReferralBundle;
  let bobData: ReferralBundle;

  beforeAll(async () => {
    alice = await makeReferrer('alice');
    bob = await makeReferrer('bob');
    expect(alice.client.getProfile()?.id).toBe(alice.practitioner.id);
    expect(bob.client.getProfile()?.id).toBe(bob.practitioner.id);

    aliceData = await createReferralFor(alice);
    bobData = await createReferralFor(bob);
  });

  for (const rt of PHI_TYPES) {
    it(`Alice can read her own ${rt}`, async () => {
      const id = pickId(aliceData, rt);
      const r = await alice.client.readResource(rt, id);
      expect(r.id).toBe(id);
    });
  }

  for (const rt of PHI_TYPES) {
    it(`Alice cannot read Bob's ${rt}`, async () => {
      const id = pickId(bobData, rt);
      let leaked = false;
      try {
        await alice.client.readResource(rt, id);
        leaked = true;
      } catch (err) {
        const status = deniedStatusOf(err);
        expect(['forbidden', 'not-found', 403, 404]).toContain(status);
      }
      expect(leaked, `Alice read Bob's ${rt}/${id} — HIPAA leak`).toBe(false);
    });
  }

  for (const rt of PHI_TYPES) {
    it(`Alice's ${rt} search includes her own and excludes Bob's`, async () => {
      const results = await alice.client.searchResources(rt, '_count=100');
      const ids = results.map((r) => r.id);

      expect(ids, `${rt} search did not return Alice's own row — broken auth or policy`)
        .toContain(pickId(aliceData, rt));

      expect(ids, `${rt} leaked Bob's row to Alice`)
        .not.toContain(pickId(bobData, rt));
    });
  }

  it('Alice cannot search AuditEvent (not in policy)', async () => {
    let leaked = false;
    try {
      await alice.client.searchResources('AuditEvent', '_count=1');
      leaked = true;
    } catch (err) {
      const status = deniedStatusOf(err);
      expect(['forbidden', 'not-found', 403, 404]).toContain(status);
    }
    expect(leaked, 'AuditEvent must not be searchable by referrers').toBe(false);
  });

  it('Alice cannot search Coverage (not in policy — insurance lives in ServiceRequest.extension)', async () => {
    let leaked = false;
    try {
      await alice.client.searchResources('Coverage', '_count=1');
      leaked = true;
    } catch (err) {
      const status = deniedStatusOf(err);
      expect(['forbidden', 'not-found', 403, 404]).toContain(status);
    }
    expect(leaked, 'Coverage must not be accessible to referrers in phase 1').toBe(false);
  });
});
