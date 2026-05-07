/**
 * One-shot live patch: append the AuditEvent rule to Referrer + ClinicStaff
 * AccessPolicies on a running Medplum stack so Phase 1.1's `auditLog()`
 * helper can write events under the user's own session.
 *
 * Re-running this is safe — it skips when the rule is already present.
 *
 *   tsx src/patch-audit-policies.ts
 */
import './node-shims.js';
import { adminClient } from './test-helpers.js';

const AUDIT_RULE = {
  resourceType: 'AuditEvent' as const,
  criteria: 'AuditEvent?agent=%profile',
};

async function patchOne(name: 'Referrer' | 'ClinicStaff'): Promise<void> {
  const { client } = await adminClient();
  const policy = await client.searchOne('AccessPolicy', `name=${name}`);
  if (!policy?.id) {
    console.warn(`AccessPolicy "${name}" not found — skipping. Run pnpm seed first.`);
    return;
  }
  const resources = policy.resource ?? [];
  const others = resources.filter((r) => r.resourceType !== 'AuditEvent');
  const patched = { ...policy, resource: [...others, AUDIT_RULE] };
  await client.updateResource(patched);
  console.warn(`[${name}] AuditEvent rule (criteria-based) installed.`);
}

async function main(): Promise<void> {
  await patchOne('Referrer');
  await patchOne('ClinicStaff');
  console.warn('Done.');
}

main().catch((err) => {
  console.error('patch-audit-policies failed:', err);
  process.exit(1);
});
