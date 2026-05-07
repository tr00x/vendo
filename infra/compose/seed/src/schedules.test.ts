import { describe, it, expect } from 'vitest';
import { buildSlotsForWeek, nextMondayUTC, MODALITIES } from './schedules.js';

describe('buildSlotsForWeek', () => {
  it('produces 30-min slots between 09:00 and 17:00 weekdays only', () => {
    const monday = new Date('2026-05-04T00:00:00Z'); // Monday
    const slots = buildSlotsForWeek({
      scheduleId: 'sched-mri',
      weekStart: monday,
      slotMinutes: 30,
      startHour: 9,
      endHour: 17,
    });
    expect(slots.length).toBe(5 * 16);
  });

  it('first slot is Monday 09:00, last is Friday 16:30', () => {
    const monday = new Date('2026-05-04T00:00:00Z');
    const slots = buildSlotsForWeek({
      scheduleId: 'sched-mri', weekStart: monday, slotMinutes: 30, startHour: 9, endHour: 17,
    });
    expect(slots[0]?.start).toBe('2026-05-04T09:00:00.000Z');
    expect(slots.at(-1)?.start).toBe('2026-05-08T16:30:00.000Z');
  });

  it('all generated slots have status=free', () => {
    const slots = buildSlotsForWeek({
      scheduleId: 'sched-mri',
      weekStart: new Date('2026-05-04T00:00:00Z'),
      slotMinutes: 30, startHour: 9, endHour: 17,
    });
    expect(slots.every((s) => s.status === 'free')).toBe(true);
  });

  it('exposes the three modalities', () => {
    expect(MODALITIES).toEqual(['MRI', 'XRAY', 'ARK']);
  });
});

describe('nextMondayUTC', () => {
  it('returns next Monday when called on Sunday', () => {
    expect(nextMondayUTC(new Date('2026-05-03T15:00:00Z')).toISOString())
      .toBe('2026-05-04T00:00:00.000Z');
  });

  it('returns one week later when already Monday', () => {
    expect(nextMondayUTC(new Date('2026-05-04T00:00:00Z')).toISOString())
      .toBe('2026-05-11T00:00:00.000Z');
  });

  it('returns this Friday\'s next Monday on Friday', () => {
    expect(nextMondayUTC(new Date('2026-05-08T12:00:00Z')).toISOString())
      .toBe('2026-05-11T00:00:00.000Z');
  });
});
