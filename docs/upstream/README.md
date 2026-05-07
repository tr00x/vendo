# Upstream contributions to Medplum

This portal is built on top of [Medplum](https://github.com/medplum/medplum)
— a self-hosted FHIR backend that did 80% of the heavy lifting (FHIR data
model, AccessPolicies, search index, OAuth, Bot runtime, audit log).

While building Vendo, we hit a few rough edges in Medplum's auth surface.
Each one is described below as a PR-ready proposal — designed to stand
alone and land independently upstream.

| # | Title | Status | File |
|---|---|---|---|
| 1 | Better error when `auth/login` succeeds but no `ProjectMembership` exists | **PR open**: [medplum#9137](https://github.com/medplum/medplum/pull/9137) | [`01-auth-login-no-membership-error.md`](01-auth-login-no-membership-error.md) |
| 2 | First-class magic-link / passwordless flow | Superseded by upstream [discussion #9109](https://github.com/medplum/medplum/discussions/9109) (OAuth pre-authorized-code grant — better design than our draft); our [RFC #9140](https://github.com/medplum/medplum/issues/9140) closed with three integration notes added | [`02-magic-link-flow.md`](02-magic-link-flow.md) |

Each doc includes:

- **Problem** — what we hit, with stack trace / log excerpt where useful.
- **Why it matters** — who else is likely to run into it.
- **Proposed fix** — concrete diff sketch, files touched, test we'd add.
- **Open questions** — things we'd want maintainer input on before sending.

> A previous draft (admin-mediated `auth/setpassword`) was dropped after we
> discovered the endpoint already exists in Medplum at `POST /admin/projects/setpassword`
> (see `packages/server/src/admin/project.ts:26-55`). One less thing to
> propose — Medplum already covers it.

These aren't theoretical — each one is a real workaround you can see in
`apps/portal/src/lib/auth/`.
