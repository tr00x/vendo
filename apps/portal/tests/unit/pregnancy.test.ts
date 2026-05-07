import { describe, it, expect } from 'vitest';
import {
  isChildbearingAge,
  pregnancyScreeningRequired,
  pregnancyStepSchema,
  wizardSchema,
  type WizardInput,
} from '@/lib/fhir/schemas';
import { buildPregnancyObservation, buildReferralBundle } from '@/lib/fhir/bundle';
import { isStepActive, nextStep, prevStep, type WizardState } from '@/components/wizard/types';

const NOW = new Date('2026-05-01T00:00:00.000Z');

describe('isChildbearingAge', () => {
  it('returns true for age 12 to 55', () => {
    expect(isChildbearingAge('2014-04-30', NOW)).toBe(true); // 12
    expect(isChildbearingAge('1971-04-30', NOW)).toBe(true); // 55
    expect(isChildbearingAge('1990-01-01', NOW)).toBe(true); // 36
  });

  it('returns false outside the window', () => {
    expect(isChildbearingAge('2015-06-01', NOW)).toBe(false); // 10
    expect(isChildbearingAge('1965-01-01', NOW)).toBe(false); // 61
  });

  it('returns false for malformed dob', () => {
    expect(isChildbearingAge('not-a-date', NOW)).toBe(false);
    expect(isChildbearingAge('', NOW)).toBe(false);
  });
});

describe('pregnancyScreeningRequired', () => {
  it('only triggers for XRAY of female patients in the age window', () => {
    expect(
      pregnancyScreeningRequired({ modality: 'XRAY', sex: 'female', birthDate: '1990-01-01', now: NOW }),
    ).toBe(true);
  });

  it('skips MRI even for in-window female patients', () => {
    expect(
      pregnancyScreeningRequired({ modality: 'MRI', sex: 'female', birthDate: '1990-01-01', now: NOW }),
    ).toBe(false);
  });

  it('skips ARK (ultrasound) — non-ionizing', () => {
    expect(
      pregnancyScreeningRequired({ modality: 'ARK', sex: 'female', birthDate: '1990-01-01', now: NOW }),
    ).toBe(false);
  });

  it('skips XRAY for male patients', () => {
    expect(
      pregnancyScreeningRequired({ modality: 'XRAY', sex: 'male', birthDate: '1990-01-01', now: NOW }),
    ).toBe(false);
  });

  it('skips XRAY for outside-window age', () => {
    expect(
      pregnancyScreeningRequired({ modality: 'XRAY', sex: 'female', birthDate: '2018-01-01', now: NOW }),
    ).toBe(false);
  });
});

describe('pregnancyStepSchema', () => {
  it('requires override reason when pregnant=yes', () => {
    const r = pregnancyStepSchema.safeParse({
      pregnant: 'yes',
      lmpDate: '',
      overrideReason: '',
    });
    expect(r.success).toBe(false);
  });

  it('accepts pregnant=yes with override reason', () => {
    const r = pregnancyStepSchema.safeParse({
      pregnant: 'yes',
      lmpDate: '',
      overrideReason: 'Suspected PE — life-threatening, fetal risk acceptable.',
    });
    expect(r.success).toBe(true);
  });

  it('accepts pregnant=no with no other fields', () => {
    const r = pregnancyStepSchema.safeParse({
      pregnant: 'no',
      lmpDate: '',
      overrideReason: '',
    });
    expect(r.success).toBe(true);
  });

  it('rejects malformed LMP', () => {
    const r = pregnancyStepSchema.safeParse({
      pregnant: 'no',
      lmpDate: '03/15/2026',
      overrideReason: '',
    });
    expect(r.success).toBe(false);
  });
});

const baseWizardXrayFemale: WizardInput = {
  patient: {
    family: 'Smith',
    given: 'Jane',
    birthDate: '1990-01-01',
    sex: 'female',
    phone: '555-1212',
    email: '',
    existingPatientId: null,
    allergies: '',
    ivContrastAllergy: 'unknown',
  },
  study: { modality: 'XRAY', bodyPart: 'Chest 2-view', reason: 'Cough', notes: '' },
  insurance: { payor: 'Aetna', memberId: 'M-1', groupNumber: '', uploads: [] },
  slot: { slotId: null, start: null, end: null },
  pregnancy: { pregnant: 'no', lmpDate: '', overrideReason: '' },
};

describe('wizardSchema pregnancy conditional', () => {
  it('rejects XRAY-female-in-window submission without pregnancy block', () => {
    const r = wizardSchema.safeParse({ ...baseWizardXrayFemale, pregnancy: undefined });
    expect(r.success).toBe(false);
  });

  it('accepts the same submission with pregnancy block present', () => {
    const r = wizardSchema.safeParse(baseWizardXrayFemale);
    expect(r.success).toBe(true);
  });

  it('does not require pregnancy block for XRAY of male patients', () => {
    const r = wizardSchema.safeParse({
      ...baseWizardXrayFemale,
      patient: { ...baseWizardXrayFemale.patient, sex: 'male' },
      pregnancy: undefined,
    });
    expect(r.success).toBe(true);
  });
});

describe('wizard step helpers — pregnancy', () => {
  function s(overrides: Partial<WizardState>): WizardState {
    return { ...baseWizardXrayFemale, step: 0, ...overrides } as WizardState;
  }

  it('makes step 4 active for XRAY female-in-window', () => {
    expect(isStepActive(s({}), 4)).toBe(true);
  });

  it('skips both step 3 and step 4 for XRAY of male patients', () => {
    const m = s({ patient: { ...baseWizardXrayFemale.patient, sex: 'male' } });
    expect(isStepActive(m, 3)).toBe(false);
    expect(isStepActive(m, 4)).toBe(false);
    expect(nextStep(m, 2)).toBe(5);
    expect(prevStep(m, 5)).toBe(2);
  });

  it('only makes step 3 (not 4) active for MRI', () => {
    const m = s({ study: { ...baseWizardXrayFemale.study, modality: 'MRI' } });
    expect(isStepActive(m, 3)).toBe(true);
    expect(isStepActive(m, 4)).toBe(false);
    expect(nextStep(m, 2)).toBe(3);
    expect(nextStep(m, 3)).toBe(5);
  });
});

describe('buildPregnancyObservation', () => {
  it('emits pregnant component + lmp + override note when applicable', () => {
    const obs = buildPregnancyObservation({
      patientRef: 'urn:uuid:p',
      practitionerRef: 'Practitioner/d',
      srUrn: 'urn:uuid:sr',
      pregnancy: { pregnant: 'yes', lmpDate: '2026-03-01', overrideReason: 'Suspected PE' },
    });
    expect(obs.basedOn?.[0]?.reference).toBe('urn:uuid:sr');
    const codes = (obs.component ?? []).map((c) => c.code.coding?.[0]?.code);
    expect(codes).toContain('pregnant');
    expect(codes).toContain('lmp');
    expect(obs.note?.[0]?.text).toContain('Suspected PE');
  });

  it('omits LMP component when no LMP given and skips override note', () => {
    const obs = buildPregnancyObservation({
      patientRef: 'urn:uuid:p',
      practitionerRef: 'Practitioner/d',
      srUrn: 'urn:uuid:sr',
      pregnancy: { pregnant: 'no', lmpDate: '', overrideReason: '' },
    });
    const codes = (obs.component ?? []).map((c) => c.code.coding?.[0]?.code);
    expect(codes).not.toContain('lmp');
    expect(obs.note).toBeUndefined();
  });
});

describe('buildReferralBundle pregnancy integration', () => {
  it('appends pregnancy Observation for XRAY of female-in-window', () => {
    const b = buildReferralBundle({ practitionerId: 'p-1', formInput: baseWizardXrayFemale });
    const observations = (b.entry ?? [])
      .filter((e) => e.resource?.resourceType === 'Observation')
      .map((e) => {
        const r = e.resource as { code?: { coding?: { code?: string }[] } };
        return r.code?.coding?.[0]?.code;
      });
    expect(observations).toContain('pregnancy-screening');
  });

  it('omits pregnancy Observation when not applicable', () => {
    const male: WizardInput = {
      ...baseWizardXrayFemale,
      patient: { ...baseWizardXrayFemale.patient, sex: 'male' },
      pregnancy: undefined,
    };
    const b = buildReferralBundle({ practitionerId: 'p-1', formInput: male });
    const observations = (b.entry ?? [])
      .filter((e) => e.resource?.resourceType === 'Observation')
      .map((e) => {
        const r = e.resource as { code?: { coding?: { code?: string }[] } };
        return r.code?.coding?.[0]?.code;
      });
    expect(observations).not.toContain('pregnancy-screening');
  });
});
