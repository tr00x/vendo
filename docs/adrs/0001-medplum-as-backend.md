# ADR 0001: Medplum as the FHIR + auth backend

**Status:** Accepted (2026-04-30)

## Context

We need a HIPAA-aligned backend that:

- Stores patient demographics, orders, appointments, and documents in a
  standard, durable schema.
- Enforces tenant-style isolation per referrer without bespoke RBAC code.
- Provides auth with magic-link sign-in and MFA.
- Supports event-driven notifications.
- Is open-source and self-hostable so we are not locked into a vendor and
  can satisfy the clinic's BAA requirements.

## Options considered

1. **Medplum self-hosted** — FHIR server + AccessPolicy + Bots + auth, MIT.
2. **AWS HealthLake** — managed FHIR, but no built-in auth or row-level
   isolation primitives we'd need to layer with Cognito + custom code.
3. **Roll our own** — Postgres + Hasura + custom auth. Highest flexibility,
   most code, longest path to HIPAA confidence.

## Decision

Medplum self-hosted on ECS Fargate behind an ALB with a private RDS Postgres
+ Redis tier and S3 buckets for binaries and audit (Object Lock 6yr).

## Consequences

- **Positive:** schema and auth are de-facto solved. AccessPolicy with
  `%profile` criteria gives row-level isolation without hand-rolling guards.
  Bots cover notification eventing.
- **Negative:** Medplum's AccessPolicy does not support chained-search
  criteria, which forces the data model to carry direct join fields on every
  PHI resource (`Patient.generalPractitioner`, `ServiceRequest.requester`,
  `Appointment.participant.actor`, `DocumentReference.author`). We document
  this constraint in the spec and plan, and gate Coverage as
  `ServiceRequest.extension` for phase 1.
- **Negative:** more infra (Postgres, Redis, signing keys) than a managed
  option. Mitigated via Terraform modules.
