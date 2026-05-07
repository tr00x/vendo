import { z } from 'zod';

export const MODALITIES = ['MRI', 'XRAY', 'ARK'] as const;
export type Modality = (typeof MODALITIES)[number];

export const patientStepSchema = z.object({
  family: z.string().trim().min(1, 'Last name required'),
  given: z.string().trim().min(1, 'First name required'),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  sex: z.enum(['male', 'female', 'other', 'unknown']),
  phone: z.string().trim().min(7, 'Phone required'),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  // null = create new; string = existing patient id chosen via dedupe modal.
  existingPatientId: z.string().nullable(),
  // Phase 2.3 — allergy attestation per referral. Free text accepts an
  // empty string (= "none reported"); iv-contrast must be one of the
  // trinary options so the clinic always knows whether the answer was
  // collected or skipped.
  allergies: z.string().trim().max(500).default(''),
  ivContrastAllergy: z.enum(['yes', 'no', 'unknown']).default('unknown'),
});
export type PatientStepInput = z.infer<typeof patientStepSchema>;

export const studyStepSchema = z.object({
  modality: z.enum(MODALITIES),
  bodyPart: z.string().trim().min(1, 'Body part required'),
  reason: z.string().trim().min(1, 'Reason required'),
  notes: z.string().max(2000).optional().default(''),
});
export type StudyStepInput = z.infer<typeof studyStepSchema>;

export const insuranceStepSchema = z.object({
  payor: z.string().trim().min(1, 'Payor required'),
  memberId: z.string().trim().min(1, 'Member ID required'),
  groupNumber: z.string().trim().optional().default(''),
  uploads: z
    .array(
      z.object({
        url: z.string().url(),
        contentType: z.string(),
        title: z.string().optional(),
      }),
    )
    .max(10, 'Max 10 files')
    .default([]),
});
export type InsuranceStepInput = z.infer<typeof insuranceStepSchema>;

export const slotStepSchema = z.object({
  // null = "schedule me — clinic will call".
  slotId: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
});
export type SlotStepInput = z.infer<typeof slotStepSchema>;

const TRINARY = z.enum(['yes', 'no', 'unknown']);
export type Trinary = z.infer<typeof TRINARY>;

// Phase 2.1 — MRI safety questionnaire. Stored as a FHIR Observation
// linked to the ServiceRequest. Each field maps 1:1 to a component on the
// Observation, so changes here must keep parity with bundle.buildMriSafetyObservation.
//
// Acceptance gates (mirrored server-side in submitReferral):
//  - pacemaker === 'yes'                              → HARD BLOCK
//  - withContrast === 'yes' && gfr != null && gfr<30  → HARD BLOCK
//  - metalImplants === 'yes' (no implantType)         → schema reject
//  - withContrast === 'yes' && gfr == null            → schema reject
export const mriSafetyStepSchema = z
  .object({
    pacemaker: TRINARY,
    metalImplants: TRINARY,
    metalImplantType: z.string().trim().max(500).optional().default(''),
    claustrophobia: z.enum(['yes', 'no']),
    withContrast: z.enum(['yes', 'no']),
    // mL/min/1.73m². Only used when withContrast==='yes'.
    gfr: z.number().int().min(1).max(200).nullable().optional().default(null),
  })
  .superRefine((val, ctx) => {
    if (val.metalImplants === 'yes' && val.metalImplantType.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metalImplantType'],
        message: 'Describe the metal implant',
      });
    }
    if (val.withContrast === 'yes' && (val.gfr == null || Number.isNaN(val.gfr))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gfr'],
        message: 'GFR required for contrast',
      });
    }
  });
export type MriSafetyStepInput = z.infer<typeof mriSafetyStepSchema>;

// Phase 2.2 — pregnancy screening for ionizing-radiation studies. Required
// when modality is XRAY and the patient is a female of childbearing age
// (12–55). LMP is optional for record-keeping; an override reason is
// mandatory when pregnant === 'yes' so the doctor explicitly accepts the
// fetal-radiation risk for this specific study.
export const pregnancyStepSchema = z
  .object({
    pregnant: TRINARY,
    lmpDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
      .optional()
      .or(z.literal('')),
    overrideReason: z.string().trim().max(500).optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (val.pregnant === 'yes' && val.overrideReason.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overrideReason'],
        message: 'Reason required when patient is pregnant',
      });
    }
  });
export type PregnancyStepInput = z.infer<typeof pregnancyStepSchema>;

export const wizardSchema = z
  .object({
    patient: patientStepSchema,
    study: studyStepSchema,
    insurance: insuranceStepSchema,
    slot: slotStepSchema,
    // Required when study.modality === 'MRI'; ignored otherwise. Server
    // re-validates conditional presence in superRefine below so a forged
    // client payload that strips it cannot bypass the safety screen.
    mriSafety: mriSafetyStepSchema.optional(),
    pregnancy: pregnancyStepSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.study.modality === 'MRI' && val.mriSafety == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mriSafety'],
        message: 'MRI safety questionnaire required',
      });
    }
    if (
      val.study.modality === 'XRAY' &&
      val.patient.sex === 'female' &&
      isChildbearingAge(val.patient.birthDate) &&
      val.pregnancy == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pregnancy'],
        message: 'Pregnancy screening required for X-ray of female 12–55',
      });
    }
  });
export type WizardInput = z.infer<typeof wizardSchema>;

/**
 * Childbearing-age window per Phase 2.2 spec — broad enough to catch
 * realistic edge cases (early menarche, late menopause) without forcing
 * the question on patients for whom pregnancy is biologically irrelevant.
 * Centralized so client UI and server validation can never disagree.
 */
export function isChildbearingAge(birthDate: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const dob = new Date(birthDate);
  if (isNaN(dob.getTime())) return false;
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 12 && age <= 55;
}

export function pregnancyScreeningRequired(args: {
  modality: 'MRI' | 'XRAY' | 'ARK';
  sex: 'male' | 'female' | 'other' | 'unknown';
  birthDate: string;
  now?: Date;
}): boolean {
  if (args.modality !== 'XRAY') return false;
  if (args.sex !== 'female') return false;
  return isChildbearingAge(args.birthDate, args.now ?? new Date());
}
