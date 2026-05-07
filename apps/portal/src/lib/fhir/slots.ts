import type { MedplumClient } from '@medplum/core';
import type { Schedule, Slot } from '@medplum/fhirtypes';
import type { Modality } from './schemas';

export async function findScheduleForModality(
  medplum: MedplumClient,
  modality: Modality,
): Promise<Schedule | undefined> {
  const results: Schedule[] = await medplum.searchResources(
    'Schedule',
    `service-category=http://vendo.local/study|${modality}&_count=1`,
  );
  return results[0];
}

export async function listAvailableSlots(
  medplum: MedplumClient,
  modality: Modality,
  fromDate: Date,
  toDate: Date,
): Promise<Slot[]> {
  const schedule = await findScheduleForModality(medplum, modality);
  if (!schedule?.id) return [];
  // Floor `fromDate` to "now or later" — the calendar must never surface
  // yesterday's slots even if a stale fromDate gets passed in (e.g. cached
  // page reloads, server clock drift, week-view tabs that lag a day).
  const now = new Date();
  const effectiveFrom = fromDate.getTime() > now.getTime() ? fromDate : now;
  const params = new URLSearchParams({
    schedule: `Schedule/${schedule.id}`,
    status: 'free',
    start: `ge${effectiveFrom.toISOString()}`,
    _count: '200',
    _sort: 'start',
  });
  params.append('start', `lt${toDate.toISOString()}`);
  const results: Slot[] = await medplum.searchResources('Slot', params.toString());
  return results;
}
