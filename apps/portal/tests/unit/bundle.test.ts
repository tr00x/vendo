import { describe, it, expect } from 'vitest';
import { buildReferralBundle } from '@/lib/fhir/bundle';
import type { WizardInput } from '@/lib/fhir/schemas';

const baseInput: WizardInput = {
  patient: {
    family: 'Smith',
    given: 'Alice',
    birthDate: '1990-01-01',
    sex: 'female',
    phone: '555-1212',
    email: 'a@b.com',
    existingPatientId: null,
  },
  study: { modality: 'MRI', bodyPart: 'Knee', reason: 'Pain', notes: '' },
  insurance: { payor: 'Aetna', memberId: 'M-1', groupNumber: '', uploads: [] },
  slot: { slotId: null, start: null, end: null },
};

describe('buildReferralBundle', () => {
  it('returns a transaction Bundle', () => {
    const b = buildReferralBundle({ practitionerId: 'p-1', formInput: baseInput });
    expect(b.resourceType).toBe('Bundle');
    expect(b.type).toBe('transaction');
  });

  it('includes Patient + ServiceRequest when no existing patient', () => {
    const b = buildReferralBundle({ practitionerId: 'p-1', formInput: baseInput });
    const types = (b.entry ?? []).map((e) => e.resource?.resourceType);
    expect(types).toEqual(['Patient', 'ServiceRequest']);
  });

  it('skips Patient when existingPatientId provided', () => {
    const b = buildReferralBundle({
      practitionerId: 'p-1',
      formInput: baseInput,
      existingPatientId: 'p-existing',
    });
    const types = (b.entry ?? []).map((e) => e.resource?.resourceType);
    expect(types).toEqual(['ServiceRequest']);
    const sr = b.entry?.[0]?.resource;
    expect(sr?.resourceType === 'ServiceRequest' && sr.subject?.reference).toBe(
      'Patient/p-existing',
    );
  });

  it('cross-references new Patient via urn:uuid pointing at the Patient entry', () => {
    const b = buildReferralBundle({ practitionerId: 'p-1', formInput: baseInput });
    const patientEntry = b.entry?.find((e) => e.resource?.resourceType === 'Patient');
    const sr = b.entry?.find((e) => e.resource?.resourceType === 'ServiceRequest')?.resource;
    const patientUrn = patientEntry?.fullUrl;
    expect(patientUrn).toMatch(/^urn:uuid:[0-9a-f-]{36}$/i);
    expect(sr?.resourceType === 'ServiceRequest' && sr.subject?.reference).toBe(patientUrn);
  });

  it('sets requester and generalPractitioner to the calling practitioner', () => {
    const b = buildReferralBundle({ practitionerId: 'p-42', formInput: baseInput });
    const patient = b.entry?.[0]?.resource;
    const sr = b.entry?.[1]?.resource;
    expect(patient?.resourceType === 'Patient' && patient.generalPractitioner?.[0]?.reference).toBe(
      'Practitioner/p-42',
    );
    expect(sr?.resourceType === 'ServiceRequest' && sr.requester?.reference).toBe(
      'Practitioner/p-42',
    );
  });

  it('attaches insurance extension to ServiceRequest', () => {
    const b = buildReferralBundle({ practitionerId: 'p-1', formInput: baseInput });
    const sr = b.entry?.find((e) => e.resource?.resourceType === 'ServiceRequest')?.resource;
    if (sr?.resourceType !== 'ServiceRequest') throw new Error('expected SR');
    expect(sr.extension?.[0]?.url).toBe('http://vendo.local/ext/insurance');
  });

  it('includes Appointment when slot picked', () => {
    const b = buildReferralBundle({
      practitionerId: 'p-1',
      formInput: {
        ...baseInput,
        slot: { slotId: 'slot-1', start: '2026-05-04T09:00:00.000Z', end: '2026-05-04T09:30:00.000Z' },
      },
    });
    const types = (b.entry ?? []).map((e) => e.resource?.resourceType);
    expect(types).toContain('Appointment');
  });

  it('includes one DocumentReference per upload', () => {
    const b = buildReferralBundle({
      practitionerId: 'p-1',
      formInput: {
        ...baseInput,
        insurance: {
          ...baseInput.insurance,
          uploads: [
            { url: 'https://x/a.pdf', contentType: 'application/pdf' },
            { url: 'https://x/b.png', contentType: 'image/png', title: 'Card' },
          ],
        },
      },
    });
    const docs = (b.entry ?? []).filter((e) => e.resource?.resourceType === 'DocumentReference');
    expect(docs.length).toBe(2);
    const second = docs[1]?.resource;
    expect(
      second?.resourceType === 'DocumentReference' &&
        second.author?.[0]?.reference,
    ).toBe('Practitioner/p-1');
  });
});
