import { NextResponse } from 'next/server';
import type { Practitioner } from '@medplum/fhirtypes';
import { bumpIdle, getSession } from '@/lib/auth/session';
import { recordSuccess } from '@/lib/auth/lockout';
import { consumeJti, verifyMagicLinkToken } from '@/lib/auth/magic-link';
import { getAdminMedplumClient } from '@/lib/medplum-admin';
import { auditLog } from '@/lib/audit';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/magic/verify?token=<signed-token>
 *
 * Single-use magic-link sign-in (option-B flow). The JWT carries the
 * recipient's profileId/email; we verify, consume the jti, then create
 * an iron-session backed by the *admin service-account* token —
 * marked `authMethod: 'magic'` so server actions know AccessPolicy is
 * bypassed and they must enforce profile-level filtering themselves.
 *
 * No Medplum password rotation occurs (we have no admin endpoint for
 * that without super-admin scope, which our service-account doesn't
 * hold). The recipient's existing password — if any — stays untouched.
 *
 * GET is intentional: magic links land in mail clients which only
 * follow GETs. Apple Mail / Outlook link-prefetch will consume the
 * jti before the user clicks; this is documented as an MVP tradeoff.
 */

function clientIp(req: Request): string | undefined {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim();
  return req.headers.get('x-real-ip') ?? undefined;
}

/** Resolve the canonical public origin for redirects. Behind Cloudflare,
 *  Next sees the internal docker host in req.url (e.g. 0.0.0.0:3000), so
 *  redirecting to `new URL('/path', req.url)` would 302 the recipient
 *  back to the unreachable internal host. Prefer NEXT_PUBLIC_APP_BASE_URL,
 *  fall back to req.url's origin only when the env var is absent. */
function publicOrigin(reqUrl: URL): string {
  const env = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  return reqUrl.origin;
}

function loginRedirect(reqUrl: URL, error: string): NextResponse {
  const url = new URL('/login', publicOrigin(reqUrl));
  url.searchParams.set('error', error);
  return NextResponse.redirect(url);
}

export async function GET(req: Request): Promise<NextResponse> {
  const reqUrl = new URL(req.url);
  const token = reqUrl.searchParams.get('token');
  const ip = clientIp(req);

  if (!token) {
    log.info('magic_verify_missing_token', { ip });
    return loginRedirect(reqUrl, 'magic_invalid');
  }

  const verdict = verifyMagicLinkToken(token);
  if (!verdict.ok) {
    log.info('magic_verify_rejected', { ip, reason: verdict.reason });
    const errorParam =
      verdict.reason === 'expired' ? 'magic_expired' :
      verdict.reason === 'replayed' ? 'magic_replayed' :
      'magic_invalid';
    return loginRedirect(reqUrl, errorParam);
  }
  const { sub: profileId, em: email, jti, exp } = verdict.payload;

  // Single-use receipt — consume FIRST so a parallel duplicate request
  // (browser prefetch, mail-client preview) can't both succeed.
  consumeJti(jti, exp);

  // Validate the recipient still exists and is active. We use the admin
  // client both for this read AND for the resulting session token. Read
  // failure is a hard fail — never seat a session for a deactivated or
  // missing referrer.
  let admin;
  let adminToken: string | undefined;
  let practitioner: Practitioner | undefined;
  try {
    admin = await getAdminMedplumClient();
    adminToken = admin.getAccessToken();
    practitioner = await admin.readResource('Practitioner', profileId);
  } catch (e) {
    log.error('magic_verify_admin_fetch_failed', { ip, profileId, error: String(e) });
    return loginRedirect(reqUrl, 'magic_login_failed');
  }
  if (!adminToken) {
    log.error('magic_verify_admin_no_token', { ip, profileId });
    return loginRedirect(reqUrl, 'magic_login_failed');
  }
  if (practitioner.active === false) {
    log.warn('magic_verify_inactive_target', { ip, profileId });
    return loginRedirect(reqUrl, 'magic_login_failed');
  }

  // Session-fixation: drop any stale cookie before persisting the new
  // session.
  const stale = await getSession();
  stale.destroy();
  const session = await getSession();
  session.accessToken = adminToken;
  session.profileId = profileId;
  session.email = email;
  session.authMethod = 'magic';
  session.createdAt = Date.now();
  bumpIdle(session);
  await session.save();

  recordSuccess(email);

  // Audit under the recipient's profile so the trail honestly reflects
  // who acted, even though the network principal was the admin client.
  try {
    const audit = admin;
    const agent: Practitioner = { resourceType: 'Practitioner', id: profileId };
    auditLog({
      medplum: audit,
      agent,
      action: 'E',
      subtype: 'login-magic',
      target: { reference: `Practitioner/${profileId}` },
      outcome: '0',
      ...(ip ? { sourceIp: ip } : {}),
    });
  } catch (auditErr) {
    log.warn('magic_verify_audit_failed', { error: String(auditErr) });
  }
  log.info('magic_verify_success', { ip, profileId, jti });

  return NextResponse.redirect(new URL('/r', publicOrigin(reqUrl)));
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Use GET with ?token=…' }, { status: 405 });
}
