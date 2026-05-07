/**
 * One-shot prod bootstrap for a Vendo Demo Clinic project.
 * Runs against an *empty* Medplum (no Project, no users yet). Safe to re-run:
 * if the project already exists it just re-applies AccessPolicies / Schedules
 * and re-invites the demo staff + referrer.
 *
 * Required env:
 *   MEDPLUM_BASE_URL          e.g. https://medplum.example.com/
 *   SEED_ADMIN_EMAIL          super-admin email (e.g. admin@example.com)
 *   SEED_ADMIN_PASSWORD       super-admin password
 *   PROJECT_NAME              e.g. Vendo Demo Clinic
 *   STAFF_PASSWORD            password for the seeded staff/referrer accounts
 */
import './node-shims.js';
import type { MedplumClient } from '@medplum/core';
import type { Practitioner } from '@medplum/fhirtypes';
import { bootstrapAdminAndProject } from './bootstrap-admin.js';
import { upsertAccessPolicies } from './bootstrap-policies.js';
import { bootstrapSchedulesAndSlots } from './bootstrap-schedules.js';

const ROLE_SYSTEM = 'http://vendo.local/role';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD;
if (!STAFF_PASSWORD) throw new Error('STAFF_PASSWORD env var is required');

interface InviteResp {
  profile?: { reference?: string };
}

interface InviteSpec {
  firstName: string;
  lastName: string;
  email: string;
  practice: string;
  role: 'ClinicStaff' | 'Referrer';
  policyName: 'ClinicStaff' | 'Referrer';
}

async function inviteAndTag(
  admin: MedplumClient,
  projectId: string,
  spec: InviteSpec,
): Promise<void> {
  const policy = await admin.searchOne('AccessPolicy', `name=${spec.policyName}`);
  if (!policy?.id) throw new Error(`AccessPolicy "${spec.policyName}" missing`);

  // If a Practitioner with this email already exists, skip the invite — just
  // re-tag in case role identifier was missing. Lets the script be re-run
  // idempotently.
  const existing = (await admin.searchResources(
    'Practitioner',
    `email=${encodeURIComponent(spec.email)}`,
  )) as Practitioner[];

  let practitionerId: string;
  if (existing.length > 0 && existing[0]?.id) {
    practitionerId = existing[0].id;
    console.warn(`  Practitioner ${spec.email} already exists (${practitionerId}) — re-tagging`);
  } else {
    const r = (await admin.post(`admin/projects/${projectId}/invite`, {
      resourceType: 'Practitioner',
      firstName: spec.firstName,
      lastName: spec.lastName,
      email: spec.email,
      password: STAFF_PASSWORD,
      sendEmail: false,
      membership: { access: [{ policy: { reference: `AccessPolicy/${policy.id}` } }] },
    })) as InviteResp;
    const id = r.profile?.reference?.split('/')[1];
    if (!id) throw new Error(`invite failed for ${spec.email}: ${JSON.stringify(r)}`);
    practitionerId = id;
    console.warn(`  Invited ${spec.email} (${practitionerId})`);
  }

  // Tag with role + practice + telecom so guard.ts.roleFromPractitioner picks it up.
  const p = await admin.readResource('Practitioner', practitionerId);
  const identifier = [
    ...(p.identifier ?? []).filter((i) => i.system !== ROLE_SYSTEM),
    { system: ROLE_SYSTEM, value: spec.role },
  ];
  await admin.updateResource({
    ...p,
    identifier,
    telecom: [{ system: 'email', value: spec.email }],
    qualification: [{ code: { text: spec.practice }, issuer: { display: spec.practice } }],
    active: true,
  });
}

async function main() {
  console.warn('--- Vendo Demo Clinic prod bootstrap ---');
  const { medplum, projectId } = await bootstrapAdminAndProject();
  console.warn(`Project: ${projectId}`);

  console.warn('Upserting AccessPolicies (Referrer + ClinicStaff)…');
  await upsertAccessPolicies(medplum);

  console.warn('Bootstrapping Schedules + Slots…');
  await bootstrapSchedulesAndSlots(medplum);

  console.warn('Inviting clinic staff (Jane Doe)…');
  await inviteAndTag(medplum, projectId, {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'staff@vendoclinic.local',
    practice: 'Vendo Demo Clinic — Front Desk',
    role: 'ClinicStaff',
    policyName: 'ClinicStaff',
  });

  // Convenience second ClinicStaff — same role, same access. Lets the team
  // log in as `frontdesk@…` for shared demos without juggling individual
  // credentials.
  console.warn('Inviting generic clinic staff (frontdesk@vendoclinic.local)…');
  await inviteAndTag(medplum, projectId, {
    firstName: 'Clinic',
    lastName: 'Staff',
    email: 'frontdesk@vendoclinic.local',
    practice: 'Vendo Demo Clinic — Front Desk',
    role: 'ClinicStaff',
    policyName: 'ClinicStaff',
  });

  console.warn('Inviting referrer (Sarah Smith)…');
  await inviteAndTag(medplum, projectId, {
    firstName: 'Sarah',
    lastName: 'Smith',
    email: 's.smith@familypractice.example',
    practice: 'Springfield Family Practice (Internal Medicine)',
    role: 'Referrer',
    policyName: 'Referrer',
  });

  console.warn('--- Done ---');
  console.warn(`  staff@vendoclinic.local         /  ${STAFF_PASSWORD}`);
  console.warn(`  s.smith@familypractice.example  /  ${STAFF_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
