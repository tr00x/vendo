import './node-shims.js';
import { bootstrapAdminAndProject } from './bootstrap-admin.js';
import { upsertAccessPolicies } from './bootstrap-policies.js';
import { bootstrapSchedulesAndSlots } from './bootstrap-schedules.js';

async function main() {
  const { medplum } = await bootstrapAdminAndProject();
  await upsertAccessPolicies(medplum);
  await bootstrapSchedulesAndSlots(medplum);
  console.warn('Seed complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
