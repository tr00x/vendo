import type { Slot } from '@medplum/fhirtypes';

export const MODALITIES = ['MRI', 'XRAY', 'ARK'] as const;
export type Modality = (typeof MODALITIES)[number];

export interface BuildSlotsArgs {
  scheduleId: string;
  weekStart: Date;
  slotMinutes: number;
  startHour: number;
  endHour: number;
}

export function buildSlotsForWeek({
  scheduleId, weekStart, slotMinutes, startHour, endHour,
}: BuildSlotsArgs): Slot[] {
  const out: Slot[] = [];
  for (let day = 0; day < 5; day++) {
    const dayStart = new Date(weekStart.getTime() + day * 86_400_000);
    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += slotMinutes) {
        const start = new Date(dayStart);
        start.setUTCHours(h, m, 0, 0);
        const end = new Date(start.getTime() + slotMinutes * 60_000);
        out.push({
          resourceType: 'Slot',
          schedule: { reference: `Schedule/${scheduleId}` },
          status: 'free',
          start: start.toISOString(),
          end: end.toISOString(),
        });
      }
    }
  }
  return out;
}

export function nextMondayUTC(d: Date): Date {
  const out = new Date(d);
  const dow = out.getUTCDay(); // Sun=0..Sat=6
  const daysUntilNextMonday = ((1 - dow + 7) % 7) || 7;
  out.setUTCDate(out.getUTCDate() + daysUntilNextMonday);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}
