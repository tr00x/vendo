import type { MedplumClient } from '@medplum/core';
import type { Device, Schedule } from '@medplum/fhirtypes';
import { MODALITIES, buildSlotsForWeek, nextMondayUTC } from './schedules.js';

export async function bootstrapSchedulesAndSlots(medplum: MedplumClient): Promise<void> {

  for (const modality of MODALITIES) {
    const device = await medplum.createResourceIfNoneExist<Device>(
      {
        resourceType: 'Device',
        identifier: [{ system: 'http://vendo.local/device', value: modality }],
        deviceName: [{ name: `${modality} machine`, type: 'user-friendly-name' }],
      },
      `identifier=http://vendo.local/device|${modality}`,
    );

    const schedule = await medplum.createResourceIfNoneExist<Schedule>(
      {
        resourceType: 'Schedule',
        active: true,
        actor: [{ reference: `Device/${device.id}` }],
        serviceCategory: [{ coding: [{ system: 'http://vendo.local/study', code: modality }] }],
      },
      `actor=Device/${device.id}`,
    );

    const monday = nextMondayUTC(new Date());
    const desired = buildSlotsForWeek({
      scheduleId: schedule.id!,
      weekStart: monday,
      slotMinutes: 30,
      startHour: 9,
      endHour: 17,
    });

    let created = 0;
    for (const slot of desired) {
      // Idempotent: skip if a Slot with same schedule + start already exists.
      const search = `schedule=Schedule/${schedule.id}&start=${encodeURIComponent(slot.start!)}`;
      const existing = await medplum.searchOne('Slot', search);
      if (existing) continue;
      await medplum.createResource(slot);
      created++;
    }
    console.warn(`Modality ${modality}: ${created} new slot(s) created (skipped ${desired.length - created} existing)`);
  }
}
