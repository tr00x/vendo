# PR draft #3 — First-class magic-link / passwordless flow

## Problem

Medplum's auth surface assumes password (or external IdP via OAuth). Users
who want a passwordless "click this link to sign in" flow have to build it
themselves on top — that's what `apps/portal/src/lib/auth/magic-link.ts`
does in this repo.

The Vendo workaround:

1. Portal mints an HMAC-signed token `{ sub, em, jti, exp }`, signs with
   `SESSION_SECRET`, emails it.
2. On click, portal verifies the token, then logs in **as a service account**
   with admin scope.
3. Portal then injects the recipient's `Practitioner.id` into the
   iron-session cookie and gates every Server Action on `session.profileId`.

This works but has real risks:

- The service-account session has wider scope than the recipient should
  have — every Server Action **must** filter by `session.profileId`. Miss
  one, and you get a privilege leak.
- Magic-link revocation has to be invented from scratch (we use a JTI table).
- Multiple tenants → service account per tenant, manually rotated.

A first-class Medplum endpoint would eliminate all three.

## Why it matters

- Magic-link is a near-default expectation for healthcare-ish products today
  (Slack, Notion, Vercel all do it). Patients/referrers don't want
  passwords.
- Reduces the "service-account-as-impersonator" anti-pattern that every
  homegrown solution will repeat.
- Token hygiene (single-use, replay protection) is exactly the kind of
  primitive that belongs in the framework, not in app code.

## Proposed fix

Two new endpoints + one config knob.

### `POST /auth/magic/request`

```ts
{
  email: string,
  recaptchaToken?: string,  // honors the same recaptcha config as login
  redirectUri: string,      // for SPA flows; whitelisted by Project config
}
```

Server:
- Resolves `User` by email (constant-time).
- Mints a JWT with claims `{ sub: User.id, jti, exp }`, signed by Medplum's
  configured `signingKey` (same one used for OAuth).
- Stores `(jti → User.id, exp)` in the database as a `MagicLinkToken`
  resource (or in a side table — depends on Medplum's preference).
- Calls the existing user-template email layer with the link.
- Returns 204 always (anti-enumeration, mirror of password reset behavior).

### `POST /auth/magic/verify`

```ts
{
  token: string,
  projectId?: string,     // optional — picks membership if user has multiple
}
```

Server:
- Validates JWT signature + expiry + JTI not consumed.
- Marks JTI consumed.
- Issues a normal access token + refresh token, scoped to the chosen
  `ProjectMembership` (same shape as `auth/login` returns).
- AuditEvent `recorder = User`, `action = MagicLinkSignIn`.

### Project-level config knob

```ts
Project.setting += {
  name: 'magicLinkEnabled',
  valueBoolean: true,
}

Project.setting += {
  name: 'magicLinkTtlMinutes',
  valueInteger: 30,
}
```

So that magic-link can be enabled per project and the TTL tuned without
code changes.

## Files touched (rough estimate)

- `packages/server/src/auth/magic.ts` (new — both endpoints)
- `packages/server/src/auth/auth.ts` (route registration)
- `packages/fhirtypes/src/MagicLinkToken.ts` (new resource type, or use
  existing `PasswordChangeRequest` with a `linkType` extension)
- `packages/server/src/auth/__tests__/magic.test.ts` (new)
- `packages/core/src/client.ts` (`MedplumClient.startMagicLink`,
  `MedplumClient.verifyMagicLink`)
- `packages/react/src/auth/MagicLinkForm.tsx` (drop-in component)

## Tests we'd add

- Happy path — request → email rendered → verify → session works.
- Replay — second `verify` of same token → 400 `replayed`.
- Expired — clock past `exp` → 400 `expired`.
- Wrong signature → 400 `bad-signature`.
- Disabled project (`magicLinkEnabled = false`) → 404.
- Anti-enumeration: request for unknown email returns 204 like a known one.
- Redirect URI not in whitelist → 400.

## Open questions

- JWT vs. opaque token: JWT lets the link be verified without DB lookup
  (faster, but no revocation). Opaque tokens require a DB row and round-trip,
  which is fine if we already write a `MagicLinkToken` row anyway.
- Whether to surface this through OAuth `code` flow instead (so SPAs can
  handle it like an OIDC dance). That's cleaner conceptually but heavier to
  ship.
- Email rendering: piggyback on the existing user-template machinery, or
  let the caller pass `subject` / `body`? We'd suggest piggyback with an
  override hook.
