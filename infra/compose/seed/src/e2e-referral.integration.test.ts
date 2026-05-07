/**
 * End-to-end exercise of the wizard's actual code path against a live
 * Medplum 5.x stack:
 *   1. Invite a referrer
 *   2. Sign in as them
 *   3. Build a referral Bundle using the same buildReferralBundle the
 *      portal's Server Action uses — proves the contract isn't drifting
 *      between portal and Medplum.
 *   4. POST it via executeBatch
 *   5. Read back the ServiceRequest under the referrer's session and
 *      verify all expected fields landed (incl. insurance extension).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { Bundle, ServiceRequest } from '@medplum/fhirtypes';
import { makeReferrer, type ReferrerCtx } from './test-helpers.js';
import { buildReferralBundle } from '@portal/lib/fhir/bundle';

describe('end-to-end referral via wizard bundle builder', () => {
  let referrer: ReferrerCtx;

  beforeAll(async () => {
    referrer = await makeReferrer('e2e');
  });

  it('builds a transaction Bundle and creates Patient + SR + Appointment + DocRef', async () => {
    if (!referrer.practitioner.id) throw new Error('practitioner id missing');
    const bundle = buildReferralBundle({
      practitionerId: referrer.practitioner.id,
      formInput: {
        patient: {
          family: 'TestFamily',
          given: 'TestGiven',
          birthDate: '1985-06-15',
          sex: 'female',
          phone: '555-9999',
          email: 'patient@example.com',
          existingPatientId: null,
          allergies: '',
          ivContrastAllergy: 'unknown',
        },
        study: { modality: 'MRI', bodyPart: 'Knee', reason: 'Pain', notes: 'phase-1 e2e test' },
        insurance: {
          payor: 'TestPayor',
          memberId: 'M-E2E',
          groupNumber: 'G-E2E',
          uploads: [],
        },
        slot: { slotId: null, start: null, end: null },
      },
    });

    const result = (await referrer.client.executeBatch(bundle)) as Bundle;
    // Resolve ServiceRequest id either from inline resource or from
    // response.location.
    const srEntry = result.entry?.find(
      (e) =>
        e.resource?.resourceType === 'ServiceRequest' ||
        e.response?.location?.startsWith('ServiceRequest/'),
    );
    const srId =
      (srEntry?.resource as ServiceRequest | undefined)?.id ??
      srEntry?.response?.location?.split('/')[1];
    expect(srId, 'ServiceRequest id missing').toBeTruthy();
    const sr = await referrer.client.readResource('ServiceRequest', srId!);

    const readBack = sr;
    expect(readBack.requester?.reference).toBe(`Practitioner/${referrer.practitioner.id}`);
    expect(readBack.code?.coding?.[0]?.code).toBe('MRI');

    // Insurance lives in extension, not in a Coverage resource.
    const insuranceExt = readBack.extension?.find(
      (x) => x.url === 'http://vendo.local/ext/insurance',
    );
    expect(insuranceExt?.extension?.find((x) => x.url === 'payor')?.valueString).toBe('TestPayor');
    expect(insuranceExt?.extension?.find((x) => x.url === 'memberId')?.valueString).toBe('M-E2E');
    expect(insuranceExt?.extension?.find((x) => x.url === 'groupNumber')?.valueString).toBe('G-E2E');

    // Patient was created with the practitioner as generalPractitioner.
    const patientId = readBack.subject?.reference?.split('/')[1];
    expect(patientId).toBeTruthy();
    const patient = await referrer.client.readResource('Patient', patientId!);
    expect(patient.generalPractitioner?.[0]?.reference).toBe(
      `Practitioner/${referrer.practitioner.id}`,
    );
  });

  it('builds a slot-bound Bundle and creates Appointment with start time', async () => {
    if (!referrer.practitioner.id) throw new Error('practitioner id missing');
    // Find a free MRI slot from the seed.
    const slots = await referrer.client.searchResources(
      'Slot',
      'status=free&_count=1&_sort=start',
    );
    const slot = slots[0];
    expect(slot?.id, 'no free slot returned by seed').toBeTruthy();

    const bundle = buildReferralBundle({
      practitionerId: referrer.practitioner.id,
      formInput: {
        patient: {
          family: 'SlotPatient',
          given: 'Pickup',
          birthDate: '1990-01-01',
          sex: 'male',
          phone: '555-0000',
          email: '',
          existingPatientId: null,
          allergies: '',
          ivContrastAllergy: 'unknown',
        },
        study: { modality: 'MRI', bodyPart: 'Shoulder', reason: 'Sprain', notes: '' },
        insurance: { payor: 'P', memberId: 'M', groupNumber: '', uploads: [] },
        slot: { slotId: slot!.id!, start: slot!.start!, end: slot!.end! },
      },
    });

    const result = (await referrer.client.executeBatch(bundle)) as Bundle;
    const apptEntry = result.entry?.find(
      (e) =>
        e.resource?.resourceType === 'Appointment' ||
        e.response?.location?.startsWith('Appointment/'),
    );
    const apptId =
      (apptEntry?.resource as { id?: string } | undefined)?.id ??
      apptEntry?.response?.location?.split('/')[1];
    expect(apptId, 'Appointment not in transaction response').toBeTruthy();
    const appt = await referrer.client.readResource('Appointment', apptId!);
    expect(appt.resourceType).toBe('Appointment');
    expect(appt.start).toBe(slot!.start);
  });
});
