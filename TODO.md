# Known issues & deferred work

A live punchlist from running this in production. Listed not because they're
hidden, but because pretending they're not there would be worse than admitting
them.

## Bugs / rough edges

- **Privilege leak risk in magic-link mode.** Magic-link auth uses a shared
  service account to mint Medplum sessions on the user's behalf. If the
  service account ever gets a wider AccessPolicy than the recipient should
  have, the issued session inherits it. Today both the service account and
  the AccessPolicy are scoped to a single project, so the failure mode is
  contained — but a multi-project deployment must rotate the service account
  per project. See `apps/portal/src/lib/auth/medplum-login.ts` for the
  implementation; the threat model is in `apps/portal/src/lib/auth/magic-link.ts`.

- **Allergies extension trust-on-read.** The portal renders allergies from a
  `ServiceRequest.extension` because Medplum's `AllergyIntolerance` resource
  isn't yet in the AccessPolicy. The extension is unsigned — a user with
  write access to the SR can lie about allergies. Acceptable for v1.0 (only
  ClinicStaff and the originating Referrer can write); needs a real
  `AllergyIntolerance` AccessPolicy entry before multi-tenant.

- **Walk-in detection is heuristic.** The wizard branches into "walk-in"
  vs "scheduled" based on whether the user is ClinicStaff and the form has
  no slot picked. There's no resource-level marker — `ServiceRequest.intent`
  is `order` either way. Replace with a `ServiceRequest.tag` the day before
  this matters for analytics.

- **Inbox sort-stability under concurrent writes.** When two ClinicStaff
  accept different referrals within the same Postgres LSN tick, the inbox's
  optimistic resort flicks them in unpredictable order until refresh.
  Cosmetic; visible only to the small front-desk team.

## Deferred features (would land in v1.1)

- TOTP MFA (mandatory for ClinicStaff + Admin).
- Self-service forgot-password (currently staff-mediated only).
- ClamAV upload scanning (single-tenant trusted-uploader is OK without).
- Error aggregation (Sentry / Honeybadger) + log shipping (`journalctl` on
  the VPS for v1.0).
- Multi-region failover, hot-standby DB.
- Public status page.
- Patient-facing accounts (everything is referrer + clinic-staff today).

## Upstream contributions to Medplum

A few things we hit while building this would be cleaner if Medplum itself
fixed them. Each is described as a PR-ready proposal in
[`docs/upstream/`](docs/upstream/):

1. Better error when `auth/login` succeeds but no `ProjectMembership` exists
   — **PR open**: [medplum#9137](https://github.com/medplum/medplum/pull/9137).
2. First-class magic-link / passwordless flow — Medplum is already
   developing this as an OAuth pre-authorized-code grant (see upstream
   [discussion #9109](https://github.com/medplum/medplum/discussions/9109));
   our [RFC #9140](https://github.com/medplum/medplum/issues/9140) closed
   with three downstream-use notes added to inform the integration.

(A third draft, "admin-mediated `auth/setpassword`", was dropped after we
discovered Medplum already ships that endpoint at
`POST /admin/projects/setpassword`.)

## Tech debt

- `apps/portal/src/components/clinic/InboxTable.tsx` is doing too much —
  filtering, sorting, optimistic state, derive-stage rendering. Split into
  hooks before the next feature.
- The seed package mixes "set up an empty project" with "fill in demo data"
  in the same scripts. Separate `bootstrap-*` from `realistic-seed` so they
  can run independently in CI.
- `apps/portal/src/app/(auth)/layout.tsx` and `apps/portal/src/components/shell/Sidebar.tsx`
  duplicate the brand-block markup. After three more places copy it, fold
  into a `<BrandLockup />`.

## Open questions

- Whether to expose the `BRAND` config via runtime headers (e.g. for
  white-label SaaS) instead of build-time env vars. Build-time is simpler;
  runtime supports per-request branding without rebuild.
- Whether to keep the Medplum admin app on a public hostname (it lives at
  `medplum.example.com` today) or hide it behind a private IP / VPN.
