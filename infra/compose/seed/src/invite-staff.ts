import './node-shims.js';
import { adminClient } from './test-helpers.js';

const PASSWORD = 'ClinicPass!2026';

async function main() {
  const { client: admin, projectId } = await adminClient();
  const staffPolicy = await admin.searchOne('AccessPolicy', 'name=ClinicStaff');
  if (!staffPolicy?.id) throw new Error('ClinicStaff policy missing — run pnpm seed first');

  const email = 'r.park@vendoclinic.local';
  // Check if already exists
  try {
    const existing = await admin.searchResources('Practitioner', `email=${encodeURIComponent(email)}`);
    if (existing.length > 0) {
      console.warn(`Already exists: ${email}`);
      return;
    }
  } catch {
    // ignore
  }

  const r = await admin.post(`admin/projects/${projectId}/invite`, {
    resourceType: 'Practitioner',
    firstName: 'Jane',
    lastName: 'Doe',
    email,
    password: PASSWORD,
    sendEmail: false,
    membership: { access: [{ policy: { reference: `AccessPolicy/${staffPolicy.id}` } }] },
  });
  console.warn('Invited:', JSON.stringify(r, null, 2).slice(0, 200));

  // Tag the practitioner with their role
  const profileRef = (r as { profile?: { reference?: string } }).profile?.reference;
  const id = profileRef?.split('/')[1];
  if (id) {
    const p = await admin.readResource('Practitioner', id);
    await admin.updateResource({
      ...p,
      telecom: [{ system: 'email', value: email }],
      qualification: [{ code: { text: 'Vendo Demo Clinic — Front Desk' }, issuer: { display: 'Vendo Demo Clinic — Front Desk' } }],
    });
    console.warn(`Done: ${email} / ${PASSWORD} (Practitioner ${id})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
