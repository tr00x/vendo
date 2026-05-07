import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Magic-link tokens — passwordless sign-in, no Medplum invite UI.
 *
 * Shape: a signed envelope `<base64url(payload)>.<base64url(sig)>` where
 * payload is JSON `{ sub, em, jti, exp }`:
 *   - sub: Practitioner.id of the recipient
 *   - em : the recipient's email (audit clarity + cross-check at verify)
 *   - jti: 16-byte random — the single-use receipt; tracked in
 *          `consumedJtis` and rejected on replay.
 *   - exp: epoch-seconds; we hard-fail expired tokens.
 *
 * The HMAC key is SESSION_SECRET — the same secret iron-session uses to
 * encrypt the auth cookie. If that leaks, the whole portal is compromised
 * either way, so we don't add another secret.
 *
 * Threat notes (single-tenant MVP):
 *   - Email interception is the magic-link threat model; we cap exp at
 *     30 min and consume jti on first verify so a stolen URL can't be
 *     replayed.
 *   - In-memory consumedJtis is per-process. Multi-instance deployments
 *     must replace with Redis/DB (same caveat as `lockout.ts`).
 *   - Verify creates an iron-session backed by the admin service-account
 *     token (we don't have a super-admin endpoint to mint user tokens).
 *     Server actions consuming the session MUST gate by `profileId`
 *     before returning data — see `lib/auth/guard.ts`.
 *   - The recipient's Medplum password is NOT rotated. Magic link and
 *     password sign-in remain independent: clicking a link doesn't
 *     invalidate any password staff set; resetting a password doesn't
 *     invalidate outstanding magic links.
 */

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 min — short enough that an
                                      // intercepted link is mostly stale

interface Payload {
  sub: string; // Practitioner.id
  em: string;  // email (lowercased at issue time)
  jti: string; // single-use receipt id
  exp: number; // epoch seconds
}

function signingKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 chars');
  }
  return Buffer.from(secret);
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

function constantTimeEq(a: string, b: string): boolean {
  // base64url padding can vary by length; pad both sides to equal length
  // before comparing to keep timingSafeEqual happy.
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface IssuedToken {
  /** The full token string. URL-safe; goes into ?token= in the magic URL. */
  token: string;
  /** Receipt id — useful for audit logs & for revocation if we ever add
   *  it. Not currently exposed to the recipient. */
  jti: string;
  /** Absolute expiry for UI copy ("expires at HH:MM"). */
  expiresAt: Date;
}

/** Mint a fresh single-use magic-link token for the given recipient. */
export function issueMagicLinkToken(args: {
  practitionerId: string;
  email: string;
}): IssuedToken {
  const jti = randomBytes(16).toString('base64url');
  const exp = Math.floor((Date.now() + TOKEN_TTL_MS) / 1000);
  const payload: Payload = {
    sub: args.practitionerId,
    em: args.email.trim().toLowerCase(),
    jti,
    exp,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(body);
  return {
    token: `${body}.${sig}`,
    jti,
    expiresAt: new Date(exp * 1000),
  };
}

export type VerifyResult =
  | { ok: true; payload: Payload }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'replayed' };

/** Validate-only — does NOT consume the jti. Use to render a confirmation
 *  page where the caller wants to show "Hi Dr. X, click to sign in". */
export function verifyMagicLinkToken(token: string): VerifyResult {
  const dot = token.indexOf('.');
  if (dot < 1 || dot >= token.length - 1) return { ok: false, reason: 'malformed' };
  const body = token.slice(0, dot);
  const presentedSig = token.slice(dot + 1);

  const expectedSig = sign(body);
  if (!constantTimeEq(presentedSig, expectedSig)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let payload: Payload;
  try {
    const json = Buffer.from(body, 'base64url').toString('utf8');
    payload = JSON.parse(json) as Payload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.em !== 'string' ||
    typeof payload.jti !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp < nowSec) return { ok: false, reason: 'expired' };
  if (consumedJtis.has(payload.jti)) return { ok: false, reason: 'replayed' };
  return { ok: true, payload };
}

/** Mark the jti consumed — call after a successful sign-in so the link
 *  can't be replayed. Also schedules its own GC after the token's natural
 *  expiry so the Set doesn't leak indefinitely. */
export function consumeJti(jti: string, expSec: number): void {
  consumedJtis.add(jti);
  const ttlMs = Math.max(0, expSec * 1000 - Date.now()) + 60_000; // keep
  // a 60-sec grace past expiry so a slow second-request still sees
  // 'replayed' rather than 'expired'.
  setTimeout(() => consumedJtis.delete(jti), ttlMs).unref();
}

const consumedJtis = new Set<string>();

/** Test/dev helper — clears the in-memory replay set. */
export function _resetMagicLinkState(): void {
  consumedJtis.clear();
}
