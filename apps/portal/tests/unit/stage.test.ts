import { describe, expect, it } from 'vitest';
import type { Appointment, ServiceRequest } from '@medplum/fhirtypes';
import {
  deriveStage,
  hasTriagedAt,
  pacsLinkOf,
  TRIAGED_AT_EXTENSION_URL,
} from '@/lib/stage';

const FLAG_EXT_URL = 'http://vendo.local/ext/clinic-flags';

function srWithFlags(flags: Record<string, boolean>, extra?: ServiceRequest['extension']): ServiceRequest {
  return {
    resourceType: 'ServiceRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: 'Patient/p1' },
    extension: [
      {
        url: FLAG_EXT_URL,
        extension: Object.entries(flags).map(([k, v]) => ({ url: k, valueBoolean: v })),
      },
      ...(extra ?? []),
    ],
  };
}

describe('pacsLinkOf — latest match wins', () => {
  it('returns the link from the most recent note when multiple are present', () => {
    const sr: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
      note: [
        { text: 'Images available: https://pacs.example.com/study-OLD' },
        { text: 'Triage in progress' },
        { text: 'Images available: https://pacs.example.com/study-NEW' },
      ],
    };
    expect(pacsLinkOf(sr)).toBe('https://pacs.example.com/study-NEW');
  });

  it('strips trailing punctuation', () => {
    const sr: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
      note: [{ text: 'Images available: https://pacs.example.com/x.' }],
    };
    expect(pacsLinkOf(sr)).toBe('https://pacs.example.com/x');
  });

  it('returns undefined when no link is present', () => {
    const sr: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
      note: [{ text: 'No link here' }],
    };
    expect(pacsLinkOf(sr)).toBeUndefined();
  });
});

describe('deriveStage — sticky triagedAt', () => {
  it('returns submitted when no flag set and no triagedAt', () => {
    const sr = srWithFlags({});
    expect(deriveStage({ sr })).toBe('submitted');
  });

  it('returns triaged when at least one flag is true', () => {
    const sr = srWithFlags({ insuranceVerified: true });
    expect(deriveStage({ sr })).toBe('triaged');
  });

  it('stays at triaged after the flag is toggled off, when triagedAt is set', () => {
    // Simulates the post-toggle-off state: flags all false but the sticky
    // marker remains.
    const sr = srWithFlags({ insuranceVerified: false }, [
      { url: TRIAGED_AT_EXTENSION_URL, valueDateTime: '2026-04-30T10:00:00Z' },
    ]);
    expect(hasTriagedAt(sr.extension)).toBe(true);
    expect(deriveStage({ sr })).toBe('triaged');
  });

  it('still falls back to submitted if both flags and triagedAt are absent', () => {
    const sr: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
    };
    expect(hasTriagedAt(sr.extension)).toBe(false);
    expect(deriveStage({ sr })).toBe('submitted');
  });
});

describe('deriveStage — Phase 2.5 no-show fallback', () => {
  function srBase(): ServiceRequest {
    return {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
    };
  }
  const ap = (status: Appointment['status']): Appointment => ({
    resourceType: 'Appointment',
    status,
    participant: [{ status: 'accepted', actor: { reference: 'Patient/p1' } }],
  });

  it('returns triaged when appointment.status === noshow', () => {
    expect(deriveStage({ sr: srBase(), appointment: ap('noshow') })).toBe('triaged');
  });

  it('still returns scheduled when appointment is booked', () => {
    expect(deriveStage({ sr: srBase(), appointment: ap('booked') })).toBe('scheduled');
  });

  it('returns triaged for noshow even with prior triagedAt (idempotent)', () => {
    const sr: ServiceRequest = {
      ...srBase(),
      extension: [{ url: TRIAGED_AT_EXTENSION_URL, valueDateTime: '2026-04-30T10:00:00Z' }],
    };
    expect(deriveStage({ sr, appointment: ap('noshow') })).toBe('triaged');
  });
});
