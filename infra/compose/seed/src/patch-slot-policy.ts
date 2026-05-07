import './node-shims.js';
import { MedplumClient } from '@medplum/core';
import type { AccessPolicy } from '@medplum/fhirtypes';
import { signInPassword } from './medplum-auth.js';

const BASE_URL = process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD!;

const medplum = new MedplumClient({ baseUrl: BASE_URL, fetch });
await signInPassword(medplum, ADMIN_EMAIL, ADMIN_PASSWORD);

const policy = await medplum.searchOne('AccessPolicy', 'name=Referrer');
if (!policy?.id) throw new Error('Referrer AccessPolicy missing');

const updated: AccessPolicy = {
  ...policy,
  resource: (policy.resource ?? []).map((r) =>
    r.resourceType === 'Slot' ? { resourceType: 'Slot' as const } : r,
  ),
};
await medplum.updateResource(updated);
console.log('Referrer AccessPolicy: Slot is now writable.');
