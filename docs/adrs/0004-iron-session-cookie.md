# ADR 0004: iron-session for portal session cookies

**Status:** Accepted (2026-04-30)

## Context

The portal needs a session that survives navigation, is HttpOnly, can be
verified server-side without a database round-trip, and is tamper-resistant.

## Options considered

1. **iron-session** — JWE-encrypted cookies, sealed with a server-side secret.
   Stateless verification.
2. **Database-backed sessions** — extra round-trip per request, but easier to
   revoke.
3. **JWT in cookie** — same statelessness, larger ecosystem, but easier to
   misuse (e.g., readable client-side without HttpOnly).

## Decision

Use `iron-session` with HttpOnly + Secure (in prod) + SameSite=Lax cookies.
Idle timeout 15 min, absolute timeout 12 hr (HIPAA bar). `SESSION_SECRET` is
≥32 chars and rotated quarterly via Secrets Manager.

## Consequences

- No database hop per request → fast.
- Revocation is global (rotate secret) rather than per-user. Per-user signout
  works locally (cookie destroy), but if we need force-logout-everyone we
  rotate `SESSION_SECRET`.
- Sensitive operations (password change, MFA setup) require fresh sign-in
  within 5 minutes, enforced in `requireSession()` (phase 2 hardening).
