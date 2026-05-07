import { describe, it, expect } from 'vitest';
import { referrerAccessPolicy } from './access-policies.js';

describe('referrerAccessPolicy', () => {
  it('uses no compartment (criteria-based isolation)', () => {
    expect(referrerAccessPolicy.compartment).toBeUndefined();
  });

  it('Patient is filtered by generalPractitioner=%profile', () => {
    const r = referrerAccessPolicy.resource?.find((r) => r.resourceType === 'Patient');
    expect(r?.criteria).toBe('Patient?general-practitioner=%profile');
  });

  it('ServiceRequest is filtered by requester=%profile', () => {
    const r = referrerAccessPolicy.resource?.find((r) => r.resourceType === 'ServiceRequest');
    expect(r?.criteria).toBe('ServiceRequest?requester=%profile');
  });

  it('Appointment is filtered by actor=%profile', () => {
    const r = referrerAccessPolicy.resource?.find((r) => r.resourceType === 'Appointment');
    expect(r?.criteria).toBe('Appointment?actor=%profile');
  });

  it('DocumentReference is filtered by author=%profile (direct, NOT chained)', () => {
    const r = referrerAccessPolicy.resource?.find((r) => r.resourceType === 'DocumentReference');
    expect(r?.criteria).toBe('DocumentReference?author=%profile');
  });

  it('does NOT include Coverage (insurance lives in ServiceRequest.extension in phase 1)', () => {
    expect(referrerAccessPolicy.resource?.some((r) => r.resourceType === 'Coverage')).toBe(false);
  });

  it('includes Binary (referrers create Binary resources when uploading attachments)', () => {
    const r = referrerAccessPolicy.resource?.find((r) => r.resourceType === 'Binary');
    expect(r).toBeDefined();
    // Binary has no criteria — Medplum identifies binaries by uuid which is not
    // discoverable cross-tenant; the wizard always wraps Binaries in a
    // DocumentReference that IS criteria-filtered.
    expect(r?.criteria).toBeUndefined();
  });

  it('uses no chained search criteria (Medplum AccessPolicy limitation)', () => {
    const chained = referrerAccessPolicy.resource?.filter((r) =>
      r.criteria?.match(/[?&][a-z-]+\.[a-z-]+=/i),
    );
    expect(chained).toEqual([]);
  });

  it('Schedule is read-only and Slot is writable (wizard flips free → busy)', () => {
    const sched = referrerAccessPolicy.resource?.find((r) => r.resourceType === 'Schedule');
    const slot = referrerAccessPolicy.resource?.find((r) => r.resourceType === 'Slot');
    expect(sched?.readonly).toBe(true);
    // Slot is intentionally writable — the wizard transitions status free → busy.
    expect(slot?.readonly).toBeUndefined();
  });

  it('Practitioner is read-only and unrestricted (cross-portal author lookup)', () => {
    // Updated 2026-04-30: was `Practitioner?_id=%profile.id` — broadened to
    // unrestricted readonly so the activity timeline can render the right
    // role badge for cross-portal authors. Patient PHI gating still lives on
    // the Patient/ServiceRequest/etc rules above.
    const r = referrerAccessPolicy.resource?.find((r) => r.resourceType === 'Practitioner');
    expect(r?.readonly).toBe(true);
    expect(r?.criteria).toBeUndefined();
  });

  it('AuditEvent is scoped to own events only (Phase 1.1 self-report)', () => {
    // Updated 2026-05-01: users CREATE audit events about their own actions
    // and may READ their own history; the criteria filter blocks cross-user
    // enumeration. Admin AccessPolicy (TBD) carries unrestricted read for
    // compliance review.
    const r = referrerAccessPolicy.resource?.find((r) => r.resourceType === 'AuditEvent');
    expect(r).toBeDefined();
    expect(r?.criteria).toBe('AuditEvent?agent=%profile');
  });
});
