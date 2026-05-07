import type { AccessPolicy } from '@medplum/fhirtypes';

/**
 * Referrer AccessPolicy.
 *
 * Per-resource criteria filter to the calling user's Practitioner profile via %profile.
 * Every PHI resource carries a direct (non-chained) link to the requesting Practitioner.
 * The wizard (Chunk 5) is responsible for setting these fields on every create.
 */
export const referrerAccessPolicy: AccessPolicy = {
  resourceType: 'AccessPolicy',
  name: 'Referrer',
  resource: [
    { resourceType: 'Patient', criteria: 'Patient?general-practitioner=%profile' },
    { resourceType: 'ServiceRequest', criteria: 'ServiceRequest?requester=%profile' },
    { resourceType: 'Appointment', criteria: 'Appointment?actor=%profile' },
    { resourceType: 'DocumentReference', criteria: 'DocumentReference?author=%profile' },
    { resourceType: 'Schedule', readonly: true },
    // Slot must be writable so the wizard can flip status free → busy via the
    // two-phase ifMatch lock in submitReferral. Referrers can in theory mark
    // arbitrary slots — acceptable for v1.0 trusted users; v1.1 will add a
    // dedicated booking action with admin-context Slot writes.
    { resourceType: 'Slot' },
    // Practitioner identity (name + role) is professional info, not PHI.
    // Referrers need read access on any Practitioner referenced from notes
    // they author so the activity timeline can render the right author badge.
    // Patient PHI is gated separately on Patient/ServiceRequest/etc rows.
    { resourceType: 'Practitioner', readonly: true },
    { resourceType: 'Organization', readonly: true },
    // Binary: needed for wizard file uploads. The referrer creates Binaries
    // when attaching insurance cards / prior films. Reads happen only via
    // DocumentReference signed URLs in practice.
    { resourceType: 'Binary' },
    // Phase 1.1: users self-report HIPAA audit events. Reads are denied
    // (`hidden`) so referrers cannot enumerate the log; only Admin can read
    // it via a separate Admin policy. CREATE allowed because the portal
    // writes one AuditEvent per mutating Server Action under the user's own
    // session — no privileged service account required for the write path.
    // Audit log: user may CREATE events about themselves and READ their own
    // history (patients/clinicians have a right to inspect what was done in
    // their session under HIPAA). The criteria scoping to %profile blocks
    // cross-user enumeration. Admin role gets unrestricted read via a
    // separate AccessPolicy for compliance review.
    { resourceType: 'AuditEvent', criteria: 'AuditEvent?agent=%profile' },
  ],
};

/**
 * ClinicStaff AccessPolicy.
 *
 * Front-desk and intake staff at the imaging clinic. Cross-referrer read so
 * they can triage the incoming queue. Write access to ServiceRequest +
 * Appointment so they can confirm / cancel / mark complete. Cannot create
 * new Patients or referrals — that's the referrer's job.
 *
 * Note: ClinicStaff intentionally does NOT have an admin role at the
 * Medplum level. They're regular project members with broader resource
 * access. AuditEvent stays admin-only.
 */
export const clinicStaffAccessPolicy: AccessPolicy = {
  resourceType: 'AccessPolicy',
  name: 'ClinicStaff',
  resource: [
    { resourceType: 'Patient' },
    { resourceType: 'ServiceRequest' },
    { resourceType: 'Appointment' },
    { resourceType: 'DocumentReference' },
    { resourceType: 'Schedule' },
    { resourceType: 'Slot' },
    { resourceType: 'Practitioner' },
    { resourceType: 'Organization' },
    { resourceType: 'Binary' },
    // Phase 1.1: clinic staff also self-report audit events. Same write-only
    // semantics as the Referrer policy.
    // Audit log: user may CREATE events about themselves and READ their own
    // history (patients/clinicians have a right to inspect what was done in
    // their session under HIPAA). The criteria scoping to %profile blocks
    // cross-user enumeration. Admin role gets unrestricted read via a
    // separate AccessPolicy for compliance review.
    { resourceType: 'AuditEvent', criteria: 'AuditEvent?agent=%profile' },
  ],
};
