import type { MedplumClient } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';

export interface DedupeQuery {
  family: string;
  given: string;
  birthDate: string;
  /** Optional — when supplied, also matches patients that share the phone
   *  number even if the name was typed differently (e.g. "Jim" vs "James"). */
  phone?: string;
}

/**
 * Find Patient candidates that may be the same person the wizard is about
 * to refer. Two parallel searches — name+DOB and phone — are merged by id;
 * AccessPolicy scopes the result set to the calling Practitioner's panel
 * (`Patient?general-practitioner=%profile`), so the caller does not filter
 * again.
 */
export async function findExistingPatient(
  medplum: MedplumClient,
  q: DedupeQuery,
): Promise<Patient[]> {
  const nameParams = new URLSearchParams({
    family: q.family,
    given: q.given,
    birthdate: q.birthDate,
    _sort: '-_lastUpdated',
    _count: '10',
  });
  const searches: Array<Promise<Patient[]>> = [
    medplum.searchResources('Patient', nameParams.toString()),
  ];
  if (q.phone && q.phone.trim().length > 0) {
    const phoneParams = new URLSearchParams({
      phone: q.phone,
      _sort: '-_lastUpdated',
      _count: '10',
    });
    searches.push(medplum.searchResources('Patient', phoneParams.toString()));
  }
  const results = (await Promise.all(searches)).flat();
  // De-dupe by id, preserving first occurrence (which is the name-match
  // result — usually the higher-confidence one).
  const seen = new Set<string>();
  const merged: Patient[] = [];
  for (const p of results) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p);
  }
  return merged;
}
