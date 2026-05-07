import {
  pregnancyScreeningRequired,
  type MriSafetyStepInput,
  type PregnancyStepInput,
  type WizardInput,
} from '@/lib/fhir/schemas';

export type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type WizardState = WizardInput & { step: WizardStep };

export type WizardAction =
  | { type: 'patient'; payload: WizardInput['patient'] }
  | { type: 'study'; payload: WizardInput['study'] }
  | { type: 'insurance'; payload: WizardInput['insurance'] }
  | { type: 'slot'; payload: WizardInput['slot'] }
  | { type: 'mriSafety'; payload: MriSafetyStepInput }
  | { type: 'pregnancy'; payload: PregnancyStepInput }
  | { type: 'goto'; step: WizardStep }
  | { type: 'reset' };

export const initialMriSafety: MriSafetyStepInput = {
  pacemaker: 'unknown',
  metalImplants: 'unknown',
  metalImplantType: '',
  claustrophobia: 'no',
  withContrast: 'no',
  gfr: null,
};

export const initialPregnancy: PregnancyStepInput = {
  pregnant: 'unknown',
  lmpDate: '',
  overrideReason: '',
};

export const initialState: WizardState = {
  step: 0,
  patient: {
    family: '',
    given: '',
    birthDate: '',
    sex: 'unknown',
    phone: '',
    email: '',
    existingPatientId: null,
    allergies: '',
    ivContrastAllergy: 'unknown',
  },
  study: { modality: 'MRI', bodyPart: '', reason: '', notes: '' },
  insurance: { payor: '', memberId: '', groupNumber: '', uploads: [] },
  slot: { slotId: null, start: null, end: null },
  mriSafety: initialMriSafety,
  pregnancy: initialPregnancy,
};

export function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'patient':
      return { ...state, patient: action.payload };
    case 'study':
      return { ...state, study: action.payload };
    case 'insurance':
      return { ...state, insurance: action.payload };
    case 'slot':
      return { ...state, slot: action.payload };
    case 'mriSafety':
      return { ...state, mriSafety: action.payload };
    case 'pregnancy':
      return { ...state, pregnancy: action.payload };
    case 'goto':
      return { ...state, step: action.step };
    case 'reset':
      return initialState;
  }
}

export interface InitialSlots {
  modality: 'MRI' | 'XRAY' | 'ARK';
  slots: { id?: string; start?: string; end?: string }[];
}

// Conditional steps:
//  - 3 (MRI safety) shows only when study.modality === 'MRI'.
//  - 4 (pregnancy)  shows only for X-ray of female patients aged 12–55.
// At most one of {3,4} is ever active because modality is mutually exclusive.
// nextStep/prevStep walk past inactive steps so neither user nor router
// ever lands on a hidden step.
export function isStepActive(state: WizardState, step: WizardStep): boolean {
  if (step === 3) return state.study.modality === 'MRI';
  if (step === 4) {
    return pregnancyScreeningRequired({
      modality: state.study.modality,
      sex: state.patient.sex,
      birthDate: state.patient.birthDate,
    });
  }
  return true;
}

export function nextStep(state: WizardState, from: WizardStep): WizardStep {
  let s: WizardStep = from;
  while (s < 6) {
    s = ((s as number) + 1) as WizardStep;
    if (isStepActive(state, s)) return s;
  }
  return 6;
}

export function prevStep(state: WizardState, from: WizardStep): WizardStep {
  let s: WizardStep = from;
  while (s > 0) {
    s = ((s as number) - 1) as WizardStep;
    if (isStepActive(state, s)) return s;
  }
  return 0;
}
