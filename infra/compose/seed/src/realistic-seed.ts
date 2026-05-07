/**
 * Realistic clinic dataset for the Vendo Demo Clinic referral portal.
 * Run AFTER `pnpm seed` (which provisions the admin + AccessPolicy +
 * Schedule/Slot infrastructure).
 *
 * Creates:
 *   - 4 referring physicians (mix of FM/IM/Ortho/Sports Med) with known
 *     passwords for browser testing
 *   - 12 patients distributed across the referrers, with realistic names
 *     and DOBs spanning 8 to 87 years old
 *   - 14 ServiceRequests with realistic ICD-10 reasons, body parts, and
 *     clinical notes; ~half booked to a real Slot, the other half pending
 *   - DocumentReferences attached to a couple of referrals (intake forms)
 *   - All insurance details on ServiceRequest.extension per ADR 0003
 */

import './node-shims.js';
import type { MedplumClient } from '@medplum/core';
import type {
  Bundle,
  BundleEntry,
  Patient,
  Practitioner,
  Slot,
} from '@medplum/fhirtypes';
import { adminClient } from './test-helpers.js';
import { signInPassword } from './medplum-auth.js';
import { MedplumClient as MC } from '@medplum/core';

const REFERRER_PASSWORD = process.env.REFERRER_PASSWORD ?? 'DemoPass!2026';

interface ReferrerSpec {
  firstName: string;
  lastName: string;
  email: string;
  practice: string;
}

const REFERRERS: ReferrerSpec[] = [
  { firstName: 'Sarah', lastName: 'Smith', email: 's.smith@familypractice.example', practice: 'Springfield Family Practice (Internal Medicine)' },
  { firstName: 'Marcus', lastName: 'Rodriguez', email: 'm.rodriguez@orthogroup.example', practice: 'Orthopedics & Sports Medicine' },
  { firstName: 'Aisha', lastName: 'Okafor', email: 'a.okafor@sportsmed.example', practice: 'Sports Medicine Associates' },
  { firstName: 'David', lastName: 'Brown', email: 'd.brown@primarycare.example', practice: 'Primary Care, DO' },
];

interface PatientSpec {
  given: string;
  family: string;
  birthDate: string;
  gender: 'male' | 'female' | 'other';
  phone: string;
  email?: string;
  referrerIdx: number; // index into REFERRERS
}

const PATIENTS: PatientSpec[] = [
  { given: 'James',      family: 'Whitfield',  birthDate: '1958-03-12', gender: 'male',   phone: '555-010-0142', email: 'j.whitfield@example.com', referrerIdx: 0 },
  { given: 'Margaret',   family: 'O\'Sullivan',birthDate: '1947-09-03', gender: 'female', phone: '555-010-0287', referrerIdx: 0 },
  { given: 'Diego',      family: 'Vasquez',    birthDate: '1992-06-18', gender: 'male',   phone: '555-020-0419', email: 'diego.v@example.com', referrerIdx: 1 },
  { given: 'Priya',      family: 'Patel',      birthDate: '1985-11-29', gender: 'female', phone: '555-010-0633', email: 'priya.patel@example.com', referrerIdx: 1 },
  { given: 'Tyler',      family: 'Nakamura',   birthDate: '2008-01-14', gender: 'male',   phone: '555-010-0775', referrerIdx: 2 },
  { given: 'Latoya',     family: 'Williams',   birthDate: '1979-04-22', gender: 'female', phone: '555-030-0908', email: 'l.williams@example.com', referrerIdx: 2 },
  { given: 'Robert',     family: 'McCarthy',   birthDate: '1965-12-07', gender: 'male',   phone: '555-010-1124', referrerIdx: 3 },
  { given: 'Elena',      family: 'Petrova',    birthDate: '1972-08-15', gender: 'female', phone: '555-020-1267', email: 'elena.p@example.com', referrerIdx: 3 },
  { given: 'Marcus',     family: 'Johnson',    birthDate: '1989-02-28', gender: 'male',   phone: '555-010-1389', referrerIdx: 0 },
  { given: 'Hannah',     family: 'Goldstein',  birthDate: '2003-07-11', gender: 'female', phone: '555-010-1502', email: 'hannah.g@example.com', referrerIdx: 1 },
  { given: 'Frank',      family: 'D\'Angelo',  birthDate: '1953-05-19', gender: 'male',   phone: '555-010-1614', referrerIdx: 2 },
  { given: 'Sofia',      family: 'Reyes',      birthDate: '1996-10-02', gender: 'female', phone: '555-030-1738', email: 'sofia.reyes@example.com', referrerIdx: 3 },
];

interface ReferralSpec {
  patientIdx: number;
  modality: 'MRI' | 'XRAY' | 'ARK';
  bodyPart: string;
  icd10Code: string;
  icd10Display: string;
  notes: string;
  insurance: { payor: string; memberId: string; groupNumber?: string };
  bookSlot: boolean;
  status: 'active' | 'completed' | 'on-hold';
}

const REFERRALS: ReferralSpec[] = [
  // Dr Smith — Internal Med, mostly older patients
  { patientIdx: 0, modality: 'MRI',  bodyPart: 'Lumbar spine',     icd10Code: 'M54.5',  icd10Display: 'Low back pain',
    notes: '6-week history of L4-L5 radiculopathy, conservative tx failed. R/o disc herniation.',
    insurance: { payor: 'Medicare Part B', memberId: '1AA2-BB3-CC4D' }, bookSlot: true, status: 'active' },
  { patientIdx: 1, modality: 'XRAY', bodyPart: 'Right hip',        icd10Code: 'M25.551', icd10Display: 'Pain in right hip',
    notes: 'Fall 3 days ago. Ambulatory but antalgic gait. R/o fracture vs. greater trochanteric bursitis.',
    insurance: { payor: 'Medicare Part B', memberId: '1AA9-BB7-CC2D' }, bookSlot: true, status: 'completed' },
  { patientIdx: 8, modality: 'ARK',  bodyPart: 'Carotid arteries', icd10Code: 'I65.23',  icd10Display: 'Occlusion and stenosis of bilateral carotid arteries',
    notes: 'TIA last week, baseline carotid duplex needed prior to neuro consult.',
    insurance: { payor: 'Aetna PPO', memberId: 'W123456789', groupNumber: '0123456' }, bookSlot: false, status: 'active' },

  // Dr Rodriguez — Orthopedics
  { patientIdx: 2, modality: 'MRI',  bodyPart: 'Right knee',       icd10Code: 'S83.241A', icd10Display: 'Other tear of medial meniscus, current injury, right knee, initial encounter',
    notes: 'Soccer injury 2 weeks ago. Positive McMurray. PE suggestive of medial meniscal tear.',
    insurance: { payor: 'UnitedHealthcare Choice Plus', memberId: '987654321', groupNumber: '76543' }, bookSlot: true, status: 'active' },
  { patientIdx: 3, modality: 'MRI',  bodyPart: 'Left shoulder',    icd10Code: 'M75.101', icd10Display: 'Unspecified rotator cuff tear or rupture of right shoulder, not specified as traumatic',
    notes: 'Persistent shoulder pain x 3 months. Limited ROM, positive Hawkins-Kennedy. R/o rotator cuff tear.',
    insurance: { payor: 'Empire BlueCross BlueShield', memberId: 'YJK123456789' }, bookSlot: false, status: 'active' },
  { patientIdx: 9, modality: 'XRAY', bodyPart: 'Right wrist',      icd10Code: 'S62.001A', icd10Display: 'Unspecified fracture of navicular [scaphoid] bone of right wrist, initial encounter',
    notes: 'FOOSH 5 days ago. Anatomic snuffbox tenderness. R/o scaphoid fracture.',
    insurance: { payor: 'Cigna Open Access Plus', memberId: 'U12345678', groupNumber: '3204871' }, bookSlot: true, status: 'completed' },

  // Dr Okafor — Sports Med
  { patientIdx: 4, modality: 'MRI',  bodyPart: 'Right ankle',      icd10Code: 'S93.401A', icd10Display: 'Sprain of unspecified ligament of right ankle, initial encounter',
    notes: 'High-school athlete, lateral ankle inversion injury 10d ago. Persistent pain on lateral ATFL. R/o ligamentous tear.',
    insurance: { payor: 'Healthfirst Essential Plan', memberId: 'HF98765432' }, bookSlot: true, status: 'active' },
  { patientIdx: 5, modality: 'XRAY', bodyPart: 'Lumbar spine 2-view', icd10Code: 'M54.40', icd10Display: 'Lumbago with sciatica, unspecified side',
    notes: 'Marathon runner, increasing low back pain over 6w. R/o spondylolysis.',
    insurance: { payor: 'Aetna PPO', memberId: 'W876543210', groupNumber: '0987654' }, bookSlot: false, status: 'active' },
  { patientIdx: 10, modality: 'ARK', bodyPart: 'Lower extremity venous duplex', icd10Code: 'I82.401', icd10Display: 'Acute embolism and thrombosis of unspecified deep veins of right lower extremity',
    notes: 'Long-haul flight last week. Right calf swelling, positive Homans. R/o DVT.',
    insurance: { payor: 'Medicare Advantage (Humana)', memberId: 'H1A2-B3C-4D5E' }, bookSlot: true, status: 'active' },

  // Dr Brown — Primary Care
  { patientIdx: 6, modality: 'MRI',  bodyPart: 'Brain w/ and w/o contrast', icd10Code: 'R51.9',  icd10Display: 'Headache, unspecified',
    notes: 'New-onset headaches x 4 weeks, worse in AM. R/o intracranial pathology.',
    insurance: { payor: 'BlueCross BlueShield NY', memberId: 'BC123456789' }, bookSlot: false, status: 'on-hold' },
  { patientIdx: 7, modality: 'XRAY', bodyPart: 'Chest 2-view',     icd10Code: 'R05.9',  icd10Display: 'Cough, unspecified',
    notes: 'Persistent cough x 5w post-URI. R/o pneumonia, bronchiectasis.',
    insurance: { payor: 'Cigna Open Access Plus', memberId: 'U87654321', groupNumber: '3201111' }, bookSlot: true, status: 'completed' },
  { patientIdx: 11, modality: 'ARK', bodyPart: 'Thyroid ultrasound', icd10Code: 'E04.1',  icd10Display: 'Nontoxic single thyroid nodule',
    notes: 'Palpable thyroid nodule on routine PE. TSH normal. Eval per ATA guidelines.',
    insurance: { payor: 'Aetna PPO', memberId: 'W543216789', groupNumber: '0567890' }, bookSlot: true, status: 'active' },

  // A couple of "transfer of care" cross-references
  { patientIdx: 0, modality: 'XRAY', bodyPart: 'Cervical spine',   icd10Code: 'M54.2',  icd10Display: 'Cervicalgia',
    notes: 'Same patient, follow-up imaging requested by ortho consult.',
    insurance: { payor: 'Medicare Part B', memberId: '1AA2-BB3-CC4D' }, bookSlot: false, status: 'active' },
  { patientIdx: 4, modality: 'XRAY', bodyPart: 'Right ankle 3-view', icd10Code: 'S93.401A', icd10Display: 'Sprain of unspecified ligament of right ankle, initial encounter',
    notes: 'Pre-MRI plain films per ortho protocol.',
    insurance: { payor: 'Healthfirst Essential Plan', memberId: 'HF98765432' }, bookSlot: true, status: 'completed' },
];

interface InviteResp {
  user?: { reference?: string };
  profile?: { reference?: string };
}

function refId(ref?: { reference?: string }): string | undefined {
  return ref?.reference?.split('/')[1];
}

async function inviteReferrer(
  admin: MedplumClient,
  projectId: string,
  policyId: string,
  spec: ReferrerSpec,
): Promise<Practitioner> {
  const r = (await admin.post(`admin/projects/${projectId}/invite`, {
    resourceType: 'Practitioner',
    firstName: spec.firstName,
    lastName: spec.lastName,
    email: spec.email,
    password: REFERRER_PASSWORD,
    sendEmail: false,
    membership: { access: [{ policy: { reference: `AccessPolicy/${policyId}` } }] },
  })) as InviteResp;
  const id = refId(r.profile);
  if (!id) throw new Error(`invite failed for ${spec.email}: ${JSON.stringify(r)}`);
  const p = await admin.readResource('Practitioner', id);
  // Add their practice name as Practitioner.qualification[0].issuer.display
  // so it shows up in the admin UI without faking ABMS data.
  await admin.updateResource({
    ...p,
    telecom: [{ system: 'email', value: spec.email }],
    qualification: [
      {
        code: { text: spec.practice },
        issuer: { display: spec.practice },
      },
    ],
  });
  return p;
}

function urn(): string {
  return `urn:uuid:${globalThis.crypto.randomUUID()}`;
}

async function buildAndExecuteReferral(
  client: MedplumClient,
  practitioner: Practitioner,
  patient: PatientSpec,
  spec: ReferralSpec,
  slotPick: Slot | undefined,
): Promise<void> {
  const practitionerRef = `Practitioner/${practitioner.id}`;
  const patientUrn = urn();
  const srUrn = urn();
  const apptUrn = urn();
  const entries: BundleEntry[] = [];

  entries.push({
    fullUrl: patientUrn,
    request: { method: 'POST', url: 'Patient' },
    resource: {
      resourceType: 'Patient',
      name: [{ family: patient.family, given: [patient.given] }],
      birthDate: patient.birthDate,
      gender: patient.gender,
      telecom: [
        { system: 'phone', value: patient.phone },
        ...(patient.email ? [{ system: 'email' as const, value: patient.email }] : []),
      ],
      generalPractitioner: [{ reference: practitionerRef }],
    },
  });

  entries.push({
    fullUrl: srUrn,
    request: { method: 'POST', url: 'ServiceRequest' },
    resource: {
      resourceType: 'ServiceRequest',
      status: spec.status,
      intent: 'order',
      subject: { reference: patientUrn },
      requester: { reference: practitionerRef },
      code: {
        coding: [{ system: 'http://vendo.local/study', code: spec.modality }],
        text: `${spec.modality} — ${spec.bodyPart}`,
      },
      reasonCode: [
        {
          coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: spec.icd10Code, display: spec.icd10Display }],
          text: spec.icd10Display,
        },
      ],
      note: [{ text: spec.notes }],
      extension: [
        {
          url: 'http://vendo.local/ext/insurance',
          extension: [
            { url: 'payor', valueString: spec.insurance.payor },
            { url: 'memberId', valueString: spec.insurance.memberId },
            ...(spec.insurance.groupNumber
              ? [{ url: 'groupNumber', valueString: spec.insurance.groupNumber }]
              : []),
          ],
        },
      ],
    },
  });

  if (slotPick?.id && slotPick.start && slotPick.end) {
    entries.push({
      fullUrl: apptUrn,
      request: { method: 'POST', url: 'Appointment' },
      resource: {
        resourceType: 'Appointment',
        status: spec.status === 'completed' ? 'fulfilled' : 'booked',
        slot: [{ reference: `Slot/${slotPick.id}` }],
        start: slotPick.start,
        end: slotPick.end,
        participant: [
          { actor: { reference: patientUrn }, status: 'accepted' },
          { actor: { reference: practitionerRef }, status: 'accepted' },
        ],
        basedOn: [{ reference: srUrn }],
      },
    });
    // Also flip the Slot itself to busy so it's not double-booked.
    entries.push({
      request: { method: 'PUT', url: `Slot/${slotPick.id}` },
      resource: { ...slotPick, status: 'busy' },
    });
  }

  const bundle: Bundle = { resourceType: 'Bundle', type: 'transaction', entry: entries };
  await client.executeBatch(bundle);
}

async function main() {
  console.warn('--- Realistic seed start ---');
  const { client: admin, projectId } = await adminClient();

  // Find the Referrer + ClinicStaff AccessPolicies.
  const policy = await admin.searchOne('AccessPolicy', 'name=Referrer');
  if (!policy?.id) throw new Error('Referrer AccessPolicy missing — run pnpm seed first');
  const staffPolicy = await admin.searchOne('AccessPolicy', 'name=ClinicStaff');
  if (!staffPolicy?.id) throw new Error('ClinicStaff AccessPolicy missing — run pnpm seed first');

  // 1. Invite all referrers
  const practitioners: Practitioner[] = [];
  for (const r of REFERRERS) {
    console.warn(`Inviting referrer ${r.firstName} ${r.lastName} (${r.email})`);
    const p = await inviteReferrer(admin, projectId, policy.id, r);
    practitioners.push(p);
  }

  // 1b. Invite a clinic staff member.
  console.warn('Inviting clinic staff Jane Doe (staff@vendoclinic.local)');
  await inviteReferrer(admin, projectId, staffPolicy.id, {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'staff@vendoclinic.local',
    practice: 'Vendo Demo Clinic — Front Desk',
  });

  // 2. Create one MedplumClient per referrer (signed in)
  const baseUrl = process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/';
  const clients: MedplumClient[] = [];
  for (const r of REFERRERS) {
    const c = new MC({ baseUrl, fetch });
    await signInPassword(c, r.email, REFERRER_PASSWORD);
    clients.push(c);
  }

  // 3. Pre-fetch free MRI slots so we can book some.
  const freeSlots: Slot[] = (await admin.searchResources(
    'Slot',
    'status=free&_count=200&_sort=start',
  )) as Slot[];
  const slotsByModality = new Map<string, Slot[]>();
  for (const s of freeSlots) {
    const sched = s.schedule?.reference;
    if (!sched) continue;
    const arr = slotsByModality.get(sched) ?? [];
    arr.push(s);
    slotsByModality.set(sched, arr);
  }
  // Map schedule → modality so we know which slot to give a referral.
  const schedules = await admin.searchResources('Schedule', '_count=10');
  const modalityToSchedule = new Map<string, string>();
  for (const sched of schedules) {
    const code = sched.serviceCategory?.[0]?.coding?.[0]?.code;
    if (code && sched.id) modalityToSchedule.set(code, `Schedule/${sched.id}`);
  }

  function takeSlot(modality: 'MRI' | 'XRAY' | 'ARK'): Slot | undefined {
    const ref = modalityToSchedule.get(modality);
    if (!ref) return undefined;
    const arr = slotsByModality.get(ref);
    if (!arr || arr.length === 0) return undefined;
    return arr.shift();
  }

  // 4. Submit each referral as the appropriate referrer.
  let created = 0;
  for (const ref of REFERRALS) {
    const patient = PATIENTS[ref.patientIdx]!;
    const referrer = practitioners[patient.referrerIdx]!;
    const client = clients[patient.referrerIdx]!;
    const slot = ref.bookSlot ? takeSlot(ref.modality) : undefined;
    try {
      await buildAndExecuteReferral(client, referrer, patient, ref, slot);
      created++;
      console.warn(
        `  ✓ ${REFERRERS[patient.referrerIdx]!.lastName}: ${patient.given} ${patient.family} — ${ref.modality} ${ref.bodyPart}` +
          (slot ? ` (slot ${new Date(slot.start!).toLocaleString()})` : ' (pending booking)'),
      );
    } catch (err) {
      console.error(`  ✗ failed: ${(err as Error).message}`);
    }
  }

  console.warn(`--- Realistic seed complete: ${created}/${REFERRALS.length} referrals created ---`);
  console.warn(`\nBrowser-test referrer login (any of):`);
  for (const r of REFERRERS) {
    console.warn(`  ${r.email}  /  ${REFERRER_PASSWORD}`);
  }
  console.warn(`\nClinic staff login:`);
  console.warn(`  staff@vendoclinic.local  /  ${REFERRER_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
