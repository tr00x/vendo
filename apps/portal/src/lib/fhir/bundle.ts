import type { Bundle, BundleEntry, Observation } from '@medplum/fhirtypes';
import { buildInsuranceExtension } from './insurance-extension';
import { buildAllergiesExtension } from './allergies-extension';
import { appointmentEnd } from '@/lib/clinical/durations';
import { pregnancyScreeningRequired } from './schemas';
import type { MriSafetyStepInput, PregnancyStepInput, WizardInput } from './schemas';

/**
 * Generate a valid RFC 4122 UUID for use in a transaction Bundle's fullUrl.
 * FHIR spec REQUIRES proper UUIDs in `urn:uuid:` fullUrls; Medplum 5.x will
 * silently skip cross-reference resolution if the URN is not a valid UUID,
 * leaving created resources with literal "urn:uuid:patient" pointers — a
 * silent data-integrity bug.
 */
function urn(): string {
  // crypto.randomUUID is in Node 14.17+ and all modern browsers.
  return `urn:uuid:${globalThis.crypto.randomUUID()}`;
}

export interface BuildBundleArgs {
  practitionerId: string;
  formInput: WizardInput;
  /** When supplied, skip Patient creation and reference this id instead. */
  existingPatientId?: string | null;
}

/**
 * Build a FHIR transaction Bundle that creates Patient (optional) +
 * ServiceRequest (always) + Appointment (if slot picked) + DocumentReference
 * (per upload). Pure: no I/O.
 */
export function buildReferralBundle({
  practitionerId,
  formInput,
  existingPatientId,
}: BuildBundleArgs): Bundle {
  const practitionerRef = `Practitioner/${practitionerId}`;
  const useExisting = existingPatientId != null && existingPatientId.length > 0;
  const patientUrn = useExisting ? null : urn();
  const srUrn = urn();
  const apptUrn = urn();
  const patientRef = useExisting ? `Patient/${existingPatientId}` : patientUrn!;

  const entries: BundleEntry[] = [];

  if (!useExisting) {
    entries.push({
      fullUrl: patientUrn!,
      request: { method: 'POST', url: 'Patient' },
      resource: {
        resourceType: 'Patient',
        name: [{ family: formInput.patient.family, given: [formInput.patient.given] }],
        birthDate: formInput.patient.birthDate,
        gender: formInput.patient.sex,
        telecom: [
          { system: 'phone', value: formInput.patient.phone },
          ...(formInput.patient.email
            ? [{ system: 'email' as const, value: formInput.patient.email }]
            : []),
        ],
        generalPractitioner: [{ reference: practitionerRef }],
      },
    });
  }

  entries.push({
    fullUrl: srUrn,
    request: { method: 'POST', url: 'ServiceRequest' },
    resource: {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: patientRef },
      requester: { reference: practitionerRef },
      code: {
        coding: [{ system: 'http://vendo.local/study', code: formInput.study.modality }],
        text: `${formInput.study.modality} — ${formInput.study.bodyPart}`,
      },
      reasonCode: [{ text: formInput.study.reason }],
      ...(formInput.study.notes
        ? { note: [{ text: formInput.study.notes }] }
        : {}),
      extension: [
        buildInsuranceExtension({
          payor: formInput.insurance.payor,
          memberId: formInput.insurance.memberId,
          ...(formInput.insurance.groupNumber
            ? { groupNumber: formInput.insurance.groupNumber }
            : {}),
        }),
        buildAllergiesExtension({
          text: formInput.patient.allergies ?? '',
          ivContrast: formInput.patient.ivContrastAllergy ?? 'unknown',
        }),
      ],
    },
  });

  if (formInput.slot.slotId && formInput.slot.start) {
    // FHIR R4 Appointment: start.exists() = end.exists() — both required if
    // either is set. When the picked slot doesn't carry an explicit end,
    // derive it from the modality duration table so MRI gets 60 min, X-ray
    // gets 15, etc., rather than a hard-coded 30-min fallback.
    const start = formInput.slot.start;
    const end = formInput.slot.end ?? appointmentEnd(start, formInput.study.modality);

    // Slot lock happens out-of-band via withConcurrency in submitReferral —
    // Medplum 5.x doesn't run `Bundle.type='transaction'` atomically, so
    // embedding a Slot PUT here would not prevent double-booking on its own.

    entries.push({
      fullUrl: apptUrn,
      request: { method: 'POST', url: 'Appointment' },
      resource: {
        resourceType: 'Appointment',
        status: 'booked',
        slot: [{ reference: `Slot/${formInput.slot.slotId}` }],
        start,
        end,
        participant: [
          { actor: { reference: patientRef }, status: 'accepted' },
          { actor: { reference: practitionerRef }, status: 'accepted' },
        ],
        basedOn: [{ reference: srUrn }],
      },
    });
  }

  if (formInput.study.modality === 'MRI' && formInput.mriSafety) {
    entries.push({
      request: { method: 'POST', url: 'Observation' },
      resource: buildMriSafetyObservation({
        patientRef,
        practitionerRef,
        srUrn,
        safety: formInput.mriSafety,
      }),
    });
  }

  if (
    pregnancyScreeningRequired({
      modality: formInput.study.modality,
      sex: formInput.patient.sex,
      birthDate: formInput.patient.birthDate,
    }) &&
    formInput.pregnancy
  ) {
    entries.push({
      request: { method: 'POST', url: 'Observation' },
      resource: buildPregnancyObservation({
        patientRef,
        practitionerRef,
        srUrn,
        pregnancy: formInput.pregnancy,
      }),
    });
  }

  for (const upload of formInput.insurance.uploads) {
    entries.push({
      request: { method: 'POST', url: 'DocumentReference' },
      resource: {
        resourceType: 'DocumentReference',
        status: 'current',
        subject: { reference: patientRef },
        author: [{ reference: practitionerRef }],
        context: { related: [{ reference: srUrn }] },
        content: [
          {
            attachment: {
              contentType: upload.contentType,
              url: upload.url,
              ...(upload.title ? { title: upload.title } : {}),
            },
          },
        ],
      },
    });
  }

  return { resourceType: 'Bundle', type: 'transaction', entry: entries };
}

const VENDO_MRI_SAFETY_SYSTEM = 'http://vendo.local/observation/mri-safety';
const VENDO_PREGNANCY_SYSTEM = 'http://vendo.local/observation/pregnancy-screening';

/**
 * Build an Observation that captures the answers from the MRI safety
 * questionnaire. Each question is a `component`; the top-level Observation
 * carries `subject=Patient` and `basedOn=ServiceRequest` so the clinic can
 * pull the safety screen via `Observation?based-on=ServiceRequest/{id}`.
 *
 * Stays a pure builder — server-side validation (hard blocks) lives in
 * submitReferral so the Observation is only ever built for safe payloads.
 */
export function buildMriSafetyObservation(args: {
  patientRef: string;
  practitionerRef: string;
  srUrn: string;
  safety: MriSafetyStepInput;
}): Observation {
  const { patientRef, practitionerRef, srUrn, safety } = args;
  const trinaryCode = (v: 'yes' | 'no' | 'unknown') => ({
    coding: [{ system: VENDO_MRI_SAFETY_SYSTEM, code: v }],
    text: v,
  });
  const components: NonNullable<Observation['component']> = [
    {
      code: { coding: [{ system: VENDO_MRI_SAFETY_SYSTEM, code: 'pacemaker' }], text: 'Pacemaker / defibrillator / neurostimulator' },
      valueCodeableConcept: trinaryCode(safety.pacemaker),
    },
    {
      code: { coding: [{ system: VENDO_MRI_SAFETY_SYSTEM, code: 'metal-implants' }], text: 'Other metal implants' },
      valueCodeableConcept: trinaryCode(safety.metalImplants),
      ...(safety.metalImplants === 'yes' && safety.metalImplantType
        ? { note: [{ text: safety.metalImplantType }] }
        : {}),
    },
    {
      code: { coding: [{ system: VENDO_MRI_SAFETY_SYSTEM, code: 'claustrophobia' }], text: 'Claustrophobia history' },
      valueCodeableConcept: { coding: [{ system: VENDO_MRI_SAFETY_SYSTEM, code: safety.claustrophobia }], text: safety.claustrophobia },
    },
    {
      code: { coding: [{ system: VENDO_MRI_SAFETY_SYSTEM, code: 'iv-contrast' }], text: 'IV contrast (gadolinium)' },
      valueCodeableConcept: { coding: [{ system: VENDO_MRI_SAFETY_SYSTEM, code: safety.withContrast }], text: safety.withContrast },
    },
  ];
  if (safety.withContrast === 'yes' && safety.gfr != null) {
    components.push({
      code: { coding: [{ system: VENDO_MRI_SAFETY_SYSTEM, code: 'egfr' }], text: 'eGFR (mL/min/1.73m²)' },
      valueQuantity: { value: safety.gfr, unit: 'mL/min/1.73m2', system: 'http://unitsofmeasure.org', code: 'mL/min/{1.73_m2}' },
    });
  }

  return {
    resourceType: 'Observation',
    status: 'final',
    category: [
      { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }] },
    ],
    code: {
      coding: [{ system: VENDO_MRI_SAFETY_SYSTEM, code: 'mri-safety-screening', display: 'MRI safety screening' }],
      text: 'MRI safety screening',
    },
    subject: { reference: patientRef },
    basedOn: [{ reference: srUrn }],
    performer: [{ reference: practitionerRef }],
    effectiveDateTime: new Date().toISOString(),
    component: components,
  };
}

/**
 * Build the pregnancy-screening Observation for X-ray of female patients
 * 12–55. Mirrors buildMriSafetyObservation in shape so the clinic UI can
 * read both via `Observation?based-on=ServiceRequest/{id}` with a single
 * code-keyed handler. The override reason rides as a free-text note when
 * the patient is pregnant and the doctor elected to proceed.
 */
export function buildPregnancyObservation(args: {
  patientRef: string;
  practitionerRef: string;
  srUrn: string;
  pregnancy: PregnancyStepInput;
}): Observation {
  const { patientRef, practitionerRef, srUrn, pregnancy } = args;
  const components: NonNullable<Observation['component']> = [
    {
      code: {
        coding: [{ system: VENDO_PREGNANCY_SYSTEM, code: 'pregnant' }],
        text: 'Pregnant',
      },
      valueCodeableConcept: {
        coding: [{ system: VENDO_PREGNANCY_SYSTEM, code: pregnancy.pregnant }],
        text: pregnancy.pregnant,
      },
    },
  ];
  if (pregnancy.lmpDate && pregnancy.lmpDate.length > 0) {
    components.push({
      code: { coding: [{ system: VENDO_PREGNANCY_SYSTEM, code: 'lmp' }], text: 'Last menstrual period' },
      valueDateTime: pregnancy.lmpDate,
    });
  }

  return {
    resourceType: 'Observation',
    status: 'final',
    category: [
      { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }] },
    ],
    code: {
      coding: [{ system: VENDO_PREGNANCY_SYSTEM, code: 'pregnancy-screening', display: 'Pregnancy screening' }],
      text: 'Pregnancy screening',
    },
    subject: { reference: patientRef },
    basedOn: [{ reference: srUrn }],
    performer: [{ reference: practitionerRef }],
    effectiveDateTime: new Date().toISOString(),
    component: components,
    ...(pregnancy.pregnant === 'yes' && pregnancy.overrideReason
      ? { note: [{ text: `Override reason: ${pregnancy.overrideReason}` }] }
      : {}),
  };
}
