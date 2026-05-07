import { describe, it, expect } from 'vitest';
import { mriSafetyStepSchema, wizardSchema, type WizardInput } from '@/lib/fhir/schemas';
import { buildMriSafetyObservation, buildReferralBundle } from '@/lib/fhir/bundle';
import {
  initialMriSafety,
  nextStep,
  prevStep,
  type WizardState,
} from '@/components/wizard/types';

const baseWizard: WizardInput = {
  patient: {
    family: 'Smith',
    given: 'Alice',
    birthDate: '1990-01-01',
    sex: 'female',
    phone: '555-1212',
    email: '',
    existingPatientId: null,
  },
  study: { modality: 'MRI', bodyPart: 'Knee', reason: 'Pain', notes: '' },
  insurance: { payor: 'Aetna', memberId: 'M-1', groupNumber: '', uploads: [] },
  slot: { slotId: null, start: null, end: null },
  mriSafety: {
    pacemaker: 'no',
    metalImplants: 'no',
    metalImplantType: '',
    claustrophobia: 'no',
    withContrast: 'no',
    gfr: null,
  },
};

const baseState: WizardState = { ...baseWizard, step: 0 };

describe('mriSafetyStepSchema', () => {
  it('accepts a clean no/no/no payload', () => {
    // initialMriSafety is also schema-valid (unknown is allowed); the
    // hard-block on pacemaker='yes' is enforced in submitReferral, not
    // in the schema, so the schema layer accepts unknown freely.
    expect(mriSafetyStepSchema.safeParse(initialMriSafety).success).toBe(true);
    const ok = mriSafetyStepSchema.safeParse({
      pacemaker: 'no',
      metalImplants: 'no',
      metalImplantType: '',
      claustrophobia: 'no',
      withContrast: 'no',
      gfr: null,
    });
    expect(ok.success).toBe(true);
  });

  it('requires implant description when metalImplants=yes', () => {
    const r = mriSafetyStepSchema.safeParse({
      pacemaker: 'no',
      metalImplants: 'yes',
      metalImplantType: '',
      claustrophobia: 'no',
      withContrast: 'no',
      gfr: null,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'metalImplantType')).toBe(true);
    }
  });

  it('requires GFR when withContrast=yes', () => {
    const r = mriSafetyStepSchema.safeParse({
      pacemaker: 'no',
      metalImplants: 'no',
      metalImplantType: '',
      claustrophobia: 'no',
      withContrast: 'yes',
      gfr: null,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'gfr')).toBe(true);
    }
  });

  it('accepts contrast + GFR present (does not block at schema layer)', () => {
    // Schema only enforces presence/types; the < 30 hard block lives in
    // submitReferral / the UI so the server can re-decide policy without a
    // schema migration.
    const r = mriSafetyStepSchema.safeParse({
      pacemaker: 'no',
      metalImplants: 'no',
      metalImplantType: '',
      claustrophobia: 'no',
      withContrast: 'yes',
      gfr: 25,
    });
    expect(r.success).toBe(true);
  });
});

describe('wizardSchema MRI conditional', () => {
  it('rejects MRI submission without mriSafety block', () => {
    const r = wizardSchema.safeParse({ ...baseWizard, mriSafety: undefined });
    expect(r.success).toBe(false);
  });

  it('accepts XRAY submission without mriSafety block (male, no pregnancy required)', () => {
    const r = wizardSchema.safeParse({
      ...baseWizard,
      patient: { ...baseWizard.patient, sex: 'male' },
      study: { ...baseWizard.study, modality: 'XRAY', bodyPart: 'Chest' },
      mriSafety: undefined,
    });
    expect(r.success).toBe(true);
  });
});

describe('wizard step helpers', () => {
  it('skips MRI safety step (3) when modality is XRAY (male — no pregnancy step either)', () => {
    const s: WizardState = {
      ...baseState,
      study: { ...baseState.study, modality: 'XRAY' },
      patient: { ...baseState.patient, sex: 'male' },
    };
    expect(nextStep(s, 2)).toBe(5);
    expect(prevStep(s, 5)).toBe(2);
  });

  it('includes MRI safety step (3) when modality is MRI', () => {
    expect(nextStep(baseState, 2)).toBe(3);
    expect(prevStep(baseState, 5)).toBe(3);
  });

  it('clamps at the boundaries', () => {
    expect(nextStep(baseState, 6)).toBe(6);
    expect(prevStep(baseState, 0)).toBe(0);
  });
});

describe('buildMriSafetyObservation', () => {
  it('builds a survey Observation linked to the SR', () => {
    const obs = buildMriSafetyObservation({
      patientRef: 'urn:uuid:patient-1',
      practitionerRef: 'Practitioner/p-1',
      srUrn: 'urn:uuid:sr-1',
      safety: {
        pacemaker: 'no',
        metalImplants: 'yes',
        metalImplantType: 'Right hip replacement (titanium)',
        claustrophobia: 'no',
        withContrast: 'yes',
        gfr: 75,
      },
    });
    expect(obs.resourceType).toBe('Observation');
    expect(obs.status).toBe('final');
    expect(obs.subject?.reference).toBe('urn:uuid:patient-1');
    expect(obs.basedOn?.[0]?.reference).toBe('urn:uuid:sr-1');
    expect(obs.category?.[0]?.coding?.[0]?.code).toBe('survey');
    const codes = (obs.component ?? []).map((c) => c.code.coding?.[0]?.code);
    expect(codes).toContain('pacemaker');
    expect(codes).toContain('metal-implants');
    expect(codes).toContain('claustrophobia');
    expect(codes).toContain('iv-contrast');
    expect(codes).toContain('egfr'); // contrast=yes + gfr present
    const metalComp = obs.component?.find((c) => c.code.coding?.[0]?.code === 'metal-implants');
    expect(metalComp?.note?.[0]?.text).toBe('Right hip replacement (titanium)');
    const gfrComp = obs.component?.find((c) => c.code.coding?.[0]?.code === 'egfr');
    expect(gfrComp?.valueQuantity?.value).toBe(75);
  });

  it('omits the eGFR component when no IV contrast is requested', () => {
    const obs = buildMriSafetyObservation({
      patientRef: 'Patient/p-1',
      practitionerRef: 'Practitioner/pr-1',
      srUrn: 'urn:uuid:sr-1',
      safety: {
        pacemaker: 'no',
        metalImplants: 'no',
        metalImplantType: '',
        claustrophobia: 'no',
        withContrast: 'no',
        gfr: null,
      },
    });
    const codes = (obs.component ?? []).map((c) => c.code.coding?.[0]?.code);
    expect(codes).not.toContain('egfr');
  });
});

describe('buildReferralBundle MRI safety integration', () => {
  it('appends an Observation entry for MRI referrals', () => {
    const b = buildReferralBundle({ practitionerId: 'p-1', formInput: baseWizard });
    const types = (b.entry ?? []).map((e) => e.resource?.resourceType);
    expect(types).toContain('Observation');
  });

  it('omits the Observation entry for non-MRI referrals', () => {
    const xray: WizardInput = {
      ...baseWizard,
      study: { ...baseWizard.study, modality: 'XRAY', bodyPart: 'Chest' },
      mriSafety: undefined,
    };
    const b = buildReferralBundle({ practitionerId: 'p-1', formInput: xray });
    const types = (b.entry ?? []).map((e) => e.resource?.resourceType);
    expect(types).not.toContain('Observation');
  });
});
