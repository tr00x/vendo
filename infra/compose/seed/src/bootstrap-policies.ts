import type { MedplumClient } from '@medplum/core';
import type { AccessPolicy } from '@medplum/fhirtypes';
import { referrerAccessPolicy, clinicStaffAccessPolicy } from './access-policies.js';

async function upsert(medplum: MedplumClient, policy: AccessPolicy): Promise<string> {
  const existing = await medplum.searchOne(
    'AccessPolicy',
    `name=${encodeURIComponent(policy.name!)}`,
  );
  if (existing?.id) {
    const updated = (await medplum.updateResource({ ...policy, id: existing.id })) as AccessPolicy;
    console.warn(`Updated AccessPolicy: ${policy.name} (${updated.id})`);
    return updated.id!;
  }
  const created = (await medplum.createResource(policy)) as AccessPolicy;
  console.warn(`Created AccessPolicy: ${policy.name} (${created.id})`);
  return created.id!;
}

export async function upsertAccessPolicies(
  medplum: MedplumClient,
): Promise<{ referrerPolicyId: string; clinicStaffPolicyId: string }> {
  const referrerPolicyId = await upsert(medplum, referrerAccessPolicy);
  const clinicStaffPolicyId = await upsert(medplum, clinicStaffAccessPolicy);
  return { referrerPolicyId, clinicStaffPolicyId };
}
