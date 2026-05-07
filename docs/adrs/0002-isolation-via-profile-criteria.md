# ADR 0002: Per-resource %profile criteria for tenant isolation

**Status:** Accepted (2026-04-30)

## Context

We need each referring physician to see **only their own** referrals across
Patient, ServiceRequest, Appointment, and DocumentReference. Medplum's
AccessPolicy supports per-resource `criteria` filtering with the special
`%profile` variable bound to the calling user's Practitioner.

Critically, **Medplum AccessPolicy does not support chained search**: criteria
like `DocumentReference?subject:Patient.general-practitioner=%profile` are
rejected. Only direct (single-hop) search parameters work.

## Decision

Every PHI resource carries a **direct, non-chained** field that points at the
requesting Practitioner:

| Resource | Direct join field | Criteria |
|---|---|---|
| Patient | `generalPractitioner` | `Patient?general-practitioner=%profile` |
| ServiceRequest | `requester` | `ServiceRequest?requester=%profile` |
| Appointment | `participant.actor` | `Appointment?actor=%profile` |
| DocumentReference | `author` | `DocumentReference?author=%profile` |

The wizard sets these fields on every create. A referrer who forgets the field
creates a "ghost" resource invisible to themselves — not a leak.

Coverage and Binary are intentionally **not** in the policy; insurance lives in
`ServiceRequest.extension`, and Binary is fetched implicitly via
DocumentReference signed URLs.

## Consequences

- The `infra/compose/seed/src/isolation.integration.test.ts` HIPAA gate
  exercises positive read, cross-read denial, search leakage, and out-of-policy
  resource denial. It is required in CI on every PR.
- A future hardening (phase 2) is a Medplum Bot pre-write subscription that
  rejects creates without the direct join field, eliminating the "ghost
  resource" failure mode.
