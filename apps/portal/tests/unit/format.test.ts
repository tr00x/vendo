import { describe, it, expect } from 'vitest';
import {
  CLINIC_TZ,
  CLINIC_TZ_LABEL,
  formatDate,
  formatDateTime,
  formatDayTime,
  formatTime,
} from '@/lib/format';

// 2026-05-07T11:30:00Z = 7:30 AM EDT (UTC-4) on Thu May 7.
// Phase 2.4 acceptance: rendered output must say "ET" regardless of which
// browser timezone the test runs in. We can't actually flip Node's TZ here
// without spawning a child process, but we can assert the formatted string
// contains the clinic-side time and the ET label — both of which would shift
// or disappear if the formatter were reading the host TZ.
const SAMPLE_ISO = '2026-05-07T11:30:00.000Z';

describe('clinic timezone formatting (Phase 2.4)', () => {
  it('exports a single canonical clinic timezone', () => {
    expect(CLINIC_TZ).toBe('America/New_York');
    expect(CLINIC_TZ_LABEL).toBe('ET');
  });

  it('formatDateTime renders the clinic-local time with ET suffix', () => {
    const out = formatDateTime(SAMPLE_ISO);
    expect(out).toContain('7:30 AM');
    expect(out).toContain('Thu');
    expect(out).toContain('May 7');
    expect(out).toContain('2026');
    expect(out.endsWith(' ET')).toBe(true);
  });

  it('formatDayTime matches the spec format "Tue, May 7 · 7:30 AM ET"', () => {
    const out = formatDayTime(SAMPLE_ISO);
    expect(out).toBe('Thu, May 7 · 7:30 AM ET');
  });

  it('formatTime is time-only with ET label', () => {
    const out = formatTime(SAMPLE_ISO);
    expect(out).toBe('7:30 AM ET');
  });

  it('formatDate is date-only and clinic-anchored', () => {
    const out = formatDate(SAMPLE_ISO);
    expect(out).toBe('May 7, 2026');
  });

  it('returns "—" for nullish input', () => {
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDayTime(undefined)).toBe('—');
    expect(formatTime(undefined)).toBe('—');
  });

  it('survives invalid ISO strings without throwing', () => {
    expect(() => formatDateTime('not-a-date')).not.toThrow();
    expect(() => formatDayTime('not-a-date')).not.toThrow();
  });

  it('keeps clinic-local time stable across late-night UTC midnight', () => {
    // 2026-05-08T03:00:00Z = 11:00 PM EDT on May 7 (still "May 7" in clinic TZ
    // even though UTC has rolled to May 8). This guards against a regression
    // where someone uses .getDate() on the raw Date — that returns the host's
    // calendar day, not the clinic's.
    const out = formatDayTime('2026-05-08T03:00:00.000Z');
    expect(out).toContain('May 7');
    expect(out).toContain('11:00 PM');
    expect(out).toContain('ET');
  });
});
