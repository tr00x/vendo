import type { MedplumClient } from '@medplum/core';
import type { Practitioner } from '@medplum/fhirtypes';
import { ROLE_SYSTEM } from './auth/guard';
import type { AuthorRole } from '@/components/shared/ActivityTimeline';

export interface PractitionerInfo {
  name: string;
  role: AuthorRole;
}

function nameOf(p: Practitioner): string {
  const n = p.name?.[0];
  if (!n) return p.id ?? 'Unknown';
  const given = n.given?.join(' ') ?? '';
  const family = n.family ?? '';
  return [given, family].filter(Boolean).join(' ') || (p.id ?? 'Unknown');
}

function roleOf(p: Practitioner): AuthorRole {
  const tag = p.identifier?.find((i) => i.system === ROLE_SYSTEM)?.value;
  if (tag === 'ClinicStaff') return 'ClinicStaff';
  if (tag === 'Referrer') return 'Referrer';
  const practice = p.qualification?.[0]?.code?.text ?? '';
  if (/Front Desk|Clinic Staff|Imaging Clinic —/i.test(practice)) return 'ClinicStaff';
  if (practice) return 'Referrer';
  // No role tag, no qualification — that's the project owner (admin). They
  // operate on the clinic side, so render their notes as ClinicStaff in the
  // timeline rather than as 'Unverified'.
  return 'ClinicStaff';
}

/** Bulk-read Practitioners by id and build the role map for ActivityTimeline. */
export async function loadPractitionerRoles(
  medplum: MedplumClient,
  ids: Iterable<string>,
): Promise<Map<string, PractitionerInfo>> {
  const map = new Map<string, PractitionerInfo>();
  await Promise.all(
    Array.from(ids).map(async (id) => {
      try {
        const p = await medplum.readResource('Practitioner', id);
        map.set(id, { name: nameOf(p), role: roleOf(p) });
      } catch {
        // Practitioner might be invisible to this role; leave out so the
        // timeline shows it as Unknown / Unverified.
      }
    }),
  );
  return map;
}
