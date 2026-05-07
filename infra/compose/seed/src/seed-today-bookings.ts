/* Demo seeder for /clinic/today: creates fresh Slots on today + tomorrow,
 * then books a handful of pending referrals into them. */
import { MedplumClient } from '@medplum/core';
import type { Appointment, ServiceRequest, Slot } from '@medplum/fhirtypes';
import './node-shims.js';
import { signInPassword } from './medplum-auth.js';

const BASE_URL = process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@vendo.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!1234';

const SLOT_HOURS = [9, 10, 11, 13, 14, 15, 16];

async function main() {
  const m = new MedplumClient({ baseUrl: BASE_URL, fetch });
  await signInPassword(m, ADMIN_EMAIL, ADMIN_PASSWORD);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const schedules: Record<string, string> = {};
  for (const modality of ['MRI', 'XRAY', 'ARK']) {
    const found = await m.searchResources(
      'Schedule',
      `service-category=http://vendo.local/study|${modality}&_count=1`,
    );
    if (found[0]?.id) schedules[modality] = found[0].id;
  }
  console.warn(`Schedules: ${JSON.stringify(schedules)}`);

  const freeSlots: { id: string; modality: string; start: string; end: string }[] = [];
  for (const dayOffset of [0, 1]) {
    const day = new Date(startOfToday);
    day.setDate(day.getDate() + dayOffset);
    for (const hr of SLOT_HOURS) {
      for (const [modality, scheduleId] of Object.entries(schedules)) {
        const start = new Date(day);
        start.setHours(hr, 0, 0, 0);
        if (start < now) continue;
        const end = new Date(start);
        end.setMinutes(end.getMinutes() + 30);
        const startIso = start.toISOString();

        const existing = await m.searchResources(
          'Slot',
          `schedule=Schedule/${scheduleId}&start=${startIso}&_count=1`,
        );
        if (existing.length > 0) {
          if (existing[0]!.status === 'free' && existing[0]!.id) {
            freeSlots.push({ id: existing[0]!.id, modality, start: startIso, end: end.toISOString() });
          }
          continue;
        }

        const slot = await m.createResource<Slot>({
          resourceType: 'Slot',
          schedule: { reference: `Schedule/${scheduleId}` },
          serviceCategory: [{ coding: [{ system: 'http://vendo.local/study', code: modality }] }],
          status: 'free',
          start: startIso,
          end: end.toISOString(),
        });
        if (slot.id) freeSlots.push({ id: slot.id, modality, start: startIso, end: end.toISOString() });
      }
    }
  }
  console.warn(`Free slots ready: ${freeSlots.length}`);

  const pending: ServiceRequest[] = await m.searchResources('ServiceRequest', 'status=active&_count=100&_sort=-_lastUpdated');
  const allAppts: Appointment[] = await m.searchResources('Appointment', '_count=200');
  const bookedSrIds = new Set(
    allAppts
      .filter((a) => a.status === 'booked' || a.status === 'fulfilled')
      .map((a) => a.basedOn?.[0]?.reference?.split('/')[1])
      .filter((id): id is string => !!id),
  );
  const candidates = pending.filter((sr) => sr.id && !bookedSrIds.has(sr.id));
  console.warn(`Pending without booking: ${candidates.length}`);

  const slotsByModality = new Map<string, typeof freeSlots>();
  for (const s of freeSlots) {
    if (!slotsByModality.has(s.modality)) slotsByModality.set(s.modality, []);
    slotsByModality.get(s.modality)!.push(s);
  }

  let booked = 0;
  const TARGET = Math.min(8, candidates.length);
  for (const sr of candidates) {
    if (booked >= TARGET) break;
    const modCode = sr.code?.coding?.find((c) => c.system === 'http://vendo.local/study')?.code;
    if (!modCode) continue;
    const pool = slotsByModality.get(modCode);
    if (!pool || pool.length === 0) continue;
    const slot = pool.shift()!;
    const patientRef = sr.subject?.reference;
    const practitionerRef = sr.requester?.reference;
    if (!patientRef || !practitionerRef) continue;

    try {
      const slotResource = await m.readResource('Slot', slot.id);
      await m.updateResource({ ...slotResource, status: 'busy' });
      await m.createResource<Appointment>({
        resourceType: 'Appointment',
        status: 'booked',
        slot: [{ reference: `Slot/${slot.id}` }],
        start: slot.start,
        end: slot.end,
        participant: [
          { actor: { reference: patientRef }, status: 'accepted' },
          { actor: { reference: practitionerRef }, status: 'accepted' },
        ],
        basedOn: [{ reference: `ServiceRequest/${sr.id}` }],
      });
      booked++;
      console.warn(`✓ Booked SR/${sr.id} (${modCode}) → ${slot.start}`);
    } catch (e) {
      console.warn(`Failed: ${String(e)}`);
    }
  }

  console.warn(`--- Done — booked ${booked} appointments ---`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
