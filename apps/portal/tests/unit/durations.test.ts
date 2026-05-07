import { describe, expect, it } from 'vitest';
import { appointmentEnd, durationMinutesForModality } from '@/lib/clinical/durations';

describe('durationMinutesForModality', () => {
  it('returns 60 for MRI without contrast', () => {
    expect(durationMinutesForModality('MRI')).toBe(60);
  });

  it('returns 90 for MRI with contrast', () => {
    expect(durationMinutesForModality('MRI', true)).toBe(90);
  });

  it('returns 15 for XRAY', () => {
    expect(durationMinutesForModality('XRAY')).toBe(15);
  });

  it('returns 30 for ARK / ultrasound', () => {
    expect(durationMinutesForModality('ARK')).toBe(30);
  });

  it('falls back to 30 for unknown modalities', () => {
    expect(durationMinutesForModality('CT')).toBe(30);
    expect(durationMinutesForModality(undefined)).toBe(30);
  });
});

describe('appointmentEnd', () => {
  it('adds 60 minutes for MRI', () => {
    const start = '2026-05-01T15:00:00.000Z';
    expect(appointmentEnd(start, 'MRI')).toBe('2026-05-01T16:00:00.000Z');
  });

  it('adds 15 minutes for XRAY', () => {
    const start = '2026-05-01T15:00:00.000Z';
    expect(appointmentEnd(start, 'XRAY')).toBe('2026-05-01T15:15:00.000Z');
  });

  it('respects contrast=true on MRI', () => {
    const start = '2026-05-01T15:00:00.000Z';
    expect(appointmentEnd(start, 'MRI', true)).toBe('2026-05-01T16:30:00.000Z');
  });
});
