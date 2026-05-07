import { MedplumClient } from '@medplum/core';
import type {
  Appointment,
  DocumentReference,
  Patient,
  Practitioner,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { signInPassword } from './medplum-auth.js';

const BASE_URL = process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD!;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars are required');
}

export interface ReferrerCtx {
  client: MedplumClient;
  practitioner: Practitioner;
  email: string;
  password: string;
}

/**
 * Medplum 5.x invite endpoint returns a flat ProjectMembership where `user`
 * and `profile` are reference wrappers (`{reference: 'User/<id>'}`), not
 * nested resources. Older Medplum (3.x) returned nested resources. We support
 * both shapes by extracting ids from references.
 */
interface InviteResponse {
  user?: { reference?: string; id?: string };
  profile?: { reference?: string; id?: string };
}

function extractId(ref: { reference?: string } | { id?: string } | undefined): string | undefined {
  if (!ref) return undefined;
  if ('reference' in ref && typeof ref.reference === 'string') {
    return ref.reference.split('/')[1];
  }
  if ('id' in ref && typeof ref.id === 'string') return ref.id;
  return undefined;
}

// Cached admin client across test setUp calls — Medplum's auth rate-limit
// is 5/min so we must not log in once per referrer.
let _admin: { client: MedplumClient; projectId: string } | undefined;

export async function adminClient(): Promise<{ client: MedplumClient; projectId: string }> {
  if (_admin) return _admin;
  const c = new MedplumClient({ baseUrl: BASE_URL, fetch });
  await signInPassword(c, ADMIN_EMAIL, ADMIN_PASSWORD);

  const projectRef = c.getActiveLogin()?.project?.reference;
  const projectId = projectRef?.split('/')[1];
  if (!projectId) throw new Error('Could not resolve admin project id from active login');

  const profile = c.getProfile();
  if (!profile) throw new Error('Admin profile not loaded after sign-in');
  _admin = { client: c, projectId };
  return _admin;
}

/**
 * Create a referrer with a known password. Uses Medplum's admin invite endpoint
 * (sendEmail=false) and then sets a deterministic password via the admin
 * setpassword endpoint, so tests can sign in directly.
 */
export async function makeReferrer(suffix: string): Promise<ReferrerCtx> {
  const { client: admin, projectId } = await adminClient();
  const email = `referrer-${suffix}-${Date.now()}@vendo.test`;
  const password = `Pwd-${suffix}-${Date.now()}-A1!`;

  const policy = await admin.searchOne('AccessPolicy', 'name=Referrer');
  if (!policy) throw new Error('Referrer AccessPolicy not seeded — run pnpm seed first');

  const invited = (await admin.post(`admin/projects/${projectId}/invite`, {
    resourceType: 'Practitioner',
    firstName: 'Dr',
    lastName: suffix,
    email,
    password,
    sendEmail: false,
    membership: {
      access: [{ policy: { reference: `AccessPolicy/${policy.id}` } }],
    },
  })) as InviteResponse;

  const practitionerId = extractId(invited.profile);
  if (!practitionerId) {
    throw new Error(`Invite response malformed: ${JSON.stringify(invited)}`);
  }
  // Read the Practitioner so the rest of the helper has a typed resource.
  const practitioner = await admin.readResource('Practitioner', practitionerId);

  // Password was set in the invite call above (Medplum 5.x supports inline
  // password parameter when sendEmail: false).

  const cli = new MedplumClient({ baseUrl: BASE_URL, fetch });
  await signInPassword(cli, email, password);

  const signedInProfile = cli.getProfile();
  if (signedInProfile?.id !== practitioner.id) {
    throw new Error(
      `Referrer sign-in failed: expected profile ${practitioner.id}, got ${signedInProfile?.id}`,
    );
  }

  return { client: cli, practitioner, email, password };
}

/**
 * Create one full referral chain (Patient + ServiceRequest + Appointment +
 * DocumentReference) for the given referrer. Coverage is intentionally absent
 * — see Chunk 3 "Critical design decision".
 */
export interface ReferralBundle {
  patient: Patient;
  serviceRequest: ServiceRequest;
  appointment: Appointment;
  documentReference: DocumentReference;
}

export async function createReferralFor(ref: ReferrerCtx): Promise<ReferralBundle> {
  const patient = (await ref.client.createResource({
    resourceType: 'Patient',
    name: [{ family: `Patient-${ref.email}`, given: ['Test'] }],
    birthDate: '1990-01-01',
    generalPractitioner: [{ reference: `Practitioner/${ref.practitioner.id}` }],
  })) as Patient;

  const serviceRequest = (await ref.client.createResource({
    resourceType: 'ServiceRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: `Patient/${patient.id}` },
    requester: { reference: `Practitioner/${ref.practitioner.id}` },
    code: { coding: [{ system: 'http://vendo.local/study', code: 'MRI' }] },
    extension: [
      {
        url: 'http://vendo.local/ext/insurance',
        extension: [
          { url: 'payor', valueString: 'Test Payor' },
          { url: 'memberId', valueString: 'M-12345' },
          { url: 'groupNumber', valueString: 'G-9' },
        ],
      },
    ],
  })) as ServiceRequest;

  const appointment = (await ref.client.createResource({
    resourceType: 'Appointment',
    status: 'proposed',
    participant: [
      { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
      { actor: { reference: `Practitioner/${ref.practitioner.id}` }, status: 'accepted' },
    ],
  })) as Appointment;

  const documentReference = (await ref.client.createResource({
    resourceType: 'DocumentReference',
    status: 'current',
    subject: { reference: `Patient/${patient.id}` },
    author: [{ reference: `Practitioner/${ref.practitioner.id}` }],
    content: [{ attachment: { contentType: 'text/plain', data: btoa('hello') } }],
  })) as DocumentReference;

  return { patient, serviceRequest, appointment, documentReference };
}
