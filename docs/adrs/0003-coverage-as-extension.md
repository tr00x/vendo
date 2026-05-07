# ADR 0003: Insurance as ServiceRequest.extension in phase 1

**Status:** Accepted (2026-04-30)

## Context

Insurance details (payor, member ID, group number) need to be captured at
referral time. The natural FHIR home is the `Coverage` resource.

However, `Coverage` has no native search parameter that links it to the
requesting Practitioner. Combined with Medplum's no-chained-criteria
constraint (ADR 0002), we cannot reliably isolate `Coverage` rows in the
AccessPolicy without custom search parameters or compartments.

## Decision

In phase 1, insurance is embedded inline in `ServiceRequest.extension` under
`http://vendo.local/ext/insurance`. `ServiceRequest` is already isolated by
`requester=%profile`, so insurance data inherits that protection.

`Coverage` is explicitly excluded from the Referrer AccessPolicy.

## Consequences

- Insurance is queryable only via the parent `ServiceRequest`. That matches
  current UX needs.
- Phase 2 can re-introduce `Coverage` as a separate resource gated on either
  (a) a custom Vendo `referrer` extension + custom SearchParameter, or
  (b) Medplum gaining chained-criteria support.
- Tests assert `Coverage` returns 403/404 to referrers (see
  `isolation.integration.test.ts`).
