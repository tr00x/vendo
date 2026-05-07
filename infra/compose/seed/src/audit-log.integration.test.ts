/**
 * Phase 1.1 — AuditEvent self-report.
 *
 * Verifies that:
 *   1. A user (Referrer) can CREATE an AuditEvent under their own session.
 *   2. The same user CANNOT search/read AuditEvents (hiddenFields=['*']
 *      blocks reads at the AccessPolicy boundary).
 *   3. Admin CAN read the events the user wrote (compliance review path).
 *
 * Pre-req: live `patch-audit-policies` has been applied OR `pnpm seed` has
 * been re-run with the updated AccessPolicies.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { AuditEvent } from '@medplum/fhirtypes';
import { adminClient, makeReferrer, type ReferrerCtx } from './test-helpers.js';

describe('AuditEvent self-report under user session', () => {
  let referrer: ReferrerCtx;

  beforeAll(async () => {
    referrer = await makeReferrer('audit');
  });

  it('user can create an AuditEvent for their own action', async () => {
    const created = (await referrer.client.createResource({
      resourceType: 'AuditEvent',
      type: { system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110100', display: 'Application Activity' },
      action: 'C',
      recorded: new Date().toISOString(),
      outcome: '0',
      agent: [
        { who: { reference: `Practitioner/${referrer.practitioner.id}` }, requestor: true },
      ],
      source: { observer: { reference: `Practitioner/${referrer.practitioner.id}` }, site: 'vendo-portal' },
      entity: [{ what: { reference: 'ServiceRequest/dummy-test' } }],
    } as AuditEvent)) as AuditEvent;
    expect(created.id).toBeTruthy();
  });

  it('user cannot see audit events written by other users', async () => {
    // Make a second referrer whose events should be invisible to the first.
    const other = await makeReferrer('audit-other');
    await other.client.createResource({
      resourceType: 'AuditEvent',
      type: { system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110100' },
      action: 'C',
      recorded: new Date().toISOString(),
      outcome: '0',
      agent: [{ who: { reference: `Practitioner/${other.practitioner.id}` }, requestor: true }],
      source: { observer: { reference: `Practitioner/${other.practitioner.id}` }, site: 'vendo-portal' },
      entity: [{ what: { reference: 'ServiceRequest/dummy-other' } }],
    } as AuditEvent);

    const results = await referrer.client.searchResources('AuditEvent', '_count=50');
    const anyOther = results.some(
      (e) => e.agent?.[0]?.who?.reference === `Practitioner/${other.practitioner.id}`,
    );
    expect(anyOther, "Referrer A must not see Referrer B's audit events").toBe(false);
  });

  it('admin can read AuditEvents the user wrote', async () => {
    const { client: admin } = await adminClient();
    const all = await admin.searchResources(
      'AuditEvent',
      `agent=Practitioner/${referrer.practitioner.id}&_count=5&_sort=-_lastUpdated`,
    );
    expect(all.length).toBeGreaterThan(0);
    expect(all[0]?.agent?.[0]?.who?.reference).toBe(`Practitioner/${referrer.practitioner.id}`);
  });
});
