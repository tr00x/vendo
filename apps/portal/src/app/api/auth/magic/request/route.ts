import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import type { Practitioner } from '@medplum/fhirtypes';
import type { MedplumClient } from '@medplum/core';
import { issueMagicLinkToken } from '@/lib/auth/magic-link';
import { lockoutStatus, recordFailure } from '@/lib/auth/lockout';
import { getAdminMedplumClient } from '@/lib/medplum-admin';
import { getEmailTransport } from '@/lib/email/transport';
import { BRAND, magicLinkTemplate } from '@/lib/email/templates';
import { formatTime } from '@/lib/format';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

interface RequestBody {
  email?: string;
  acceptedTerms?: boolean;
}

function emailFingerprint(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 12);
}

function originAllowed(req: Request): boolean {
  const allowed = process.env.NEXT_PUBLIC_APP_BASE_URL;
  if (!allowed) {
    if (process.env.NODE_ENV === 'production') return false;
    const origin = req.headers.get('origin');
    return !origin || origin.startsWith('http://localhost');
  }
  const origin = req.headers.get('origin');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    return new URL(origin).origin === new URL(allowed).origin;
  } catch {
    return false;
  }
}

function clientIp(req: Request): string | undefined {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim();
  return req.headers.get('x-real-ip') ?? undefined;
}

function portalOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  return BRAND.portalUrl.replace(/\/+$/, '');
}

/**
 * Self-service magic-link request. Body: { email, acceptedTerms }.
 *
 * Always returns 200 (with a generic body) regardless of whether the
 * email maps to a real account — preventing user-enumeration via the
 * sign-in surface. The /login page renders a friendly "if it's on
 * file…" message based on `magic_sent` query param.
 *
 * Per-email lockout reuses the same in-memory bucket as password
 * sign-ins: 5 attempts per 10 min then a 30-min cool-off, so a hostile
 * client can't pump fresh links at staff inboxes.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!originAllowed(req)) {
    log.warn('magic_request_origin_rejected', { origin: req.headers.get('origin') });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawEmail = body.email?.trim().toLowerCase();
  if (!rawEmail) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }
  if (body.acceptedTerms !== true) {
    return NextResponse.json(
      { error: 'You must accept the Privacy Notice and Terms to continue.' },
      { status: 400 },
    );
  }
  const email: string = rawEmail;

  const fp = emailFingerprint(email);
  const ip = clientIp(req);

  const pre = lockoutStatus(email);
  if (pre.locked) {
    log.warn('magic_request_locked', { fp, ip, remainingMs: pre.remainingMs });
    // Same generic 200 — don't tell the caller their email is locked
    // (would also be enumeration). The lockout itself protects the
    // mail server from the actual flood.
    return NextResponse.json({ ok: true });
  }

  // Always return ok:true regardless of outcome. The work happens
  // best-effort in the background so timing-side-channels can't hint
  // at enumeration via response latency. Lockout still ticks on
  // attempts that find no account so a persistent enumerator gets
  // throttled.
  void (async () => {
    let admin: MedplumClient;
    try {
      admin = await getAdminMedplumClient();
    } catch (e) {
      log.error('magic_request_admin_unavailable', { error: String(e) });
      return;
    }
    let practitioner: Practitioner | undefined;
    try {
      const matches = (await admin.searchResources(
        'Practitioner',
        `email=${encodeURIComponent(email)}&active=true&_count=2`,
      )) as Practitioner[];
      practitioner = matches[0];
    } catch (e) {
      log.error('magic_request_search_failed', { fp, error: String(e) });
    }
    if (!practitioner?.id) {
      // No active referrer with that email. Tick the failure bucket
      // so an enumerator gets throttled, then bail silently.
      recordFailure(email);
      log.info('magic_request_no_match', { fp, ip });
      return;
    }
    const practitionerId = practitioner.id;

    // Option B: don't rotate Medplum password. The JWT alone is the
    // credential for the magic-verify path; the user's existing
    // password (if any) stays untouched.
    const recipientEmail = practitioner.telecom?.find((t) => t.system === 'email')?.value
      ?? email;
    const issued = issueMagicLinkToken({
      practitionerId,
      email: recipientEmail,
    });

    const url = `${portalOrigin()}/api/auth/magic/verify?token=${encodeURIComponent(issued.token)}`;
    const expiresLabel = formatTime(issued.expiresAt.toISOString());
    const given = (practitioner.name?.[0]?.given?.[0] ?? '').trim();
    const family = (practitioner.name?.[0]?.family ?? '').trim();
    const recipientName = [given, family].filter(Boolean).join(' ').trim() || recipientEmail;
    const content = magicLinkTemplate({
      doctor: { given, family },
      email: recipientEmail,
      url,
      expiresLabel,
      sentByName: undefined, // self-service framing
    });

    const transport = getEmailTransport();
    try {
      const result = await transport.send({
        to: recipientEmail,
        toName: recipientName,
        replyTo: BRAND.supportEmail,
        content,
      });
      log.info('magic_request_sent', {
        fp,
        ip,
        practitionerId,
        transport: transport.name,
        ok: result.ok,
        jti: issued.jti,
      });
    } catch (sendErr) {
      log.error('magic_request_send_failed', { fp, ip, error: String(sendErr) });
    }
  })();

  return NextResponse.json({ ok: true });
}
