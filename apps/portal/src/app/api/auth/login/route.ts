import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSession, bumpIdle } from '@/lib/auth/session';
import { lockoutStatus, recordFailure, recordSuccess } from '@/lib/auth/lockout';
import { medplumPasswordLogin, type LoginFailure } from '@/lib/auth/medplum-login';
import { getServerMedplumClient } from '@/lib/medplum';
import { auditLog } from '@/lib/audit';
import { log } from '@/lib/log';
import type { Practitioner } from '@medplum/fhirtypes';

export const dynamic = 'force-dynamic';

interface LoginBody {
  email?: string;
  password?: string;
  acceptedTerms?: boolean;
}

// Stable, non-reversible identifier for failure logs — lets us correlate
// multiple failed attempts without leaking the raw email into the log stream.
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

function auditSuccess(profileId: string, accessToken: string, sourceIp: string | undefined): void {
  const client = getServerMedplumClient(accessToken);
  const agent: Practitioner = { resourceType: 'Practitioner', id: profileId };
  auditLog({
    medplum: client,
    agent,
    action: 'E',
    subtype: 'login',
    target: { reference: `Practitioner/${profileId}` },
    outcome: '0',
    ...(sourceIp ? { sourceIp } : {}),
  });
}

function clientIp(req: Request): string | undefined {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim();
  return req.headers.get('x-real-ip') ?? undefined;
}

const STAGE_TO_HTTP: Record<LoginFailure, { status: number; msg: string }> = {
  'invalid-credentials': { status: 401, msg: 'Invalid email or password.' },
  'no-membership': { status: 401, msg: 'No active membership for this account.' },
  'profile-failed': { status: 401, msg: 'Could not finish sign-in. Please try again.' },
  'no-code': { status: 401, msg: 'Could not finish sign-in. Please try again.' },
  'token-failed': { status: 401, msg: 'Could not finish sign-in. Please try again.' },
  'malformed-profile': { status: 502, msg: 'Sign-in succeeded but profile reference was malformed.' },
};

export async function POST(req: Request): Promise<NextResponse> {
  if (!originAllowed(req)) {
    log.warn('login_origin_rejected', { origin: req.headers.get('origin') });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawEmail = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!rawEmail || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
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
    log.warn('login_locked', { fp, ip, remainingMs: pre.remainingMs });
    return NextResponse.json(
      {
        error: 'Account temporarily locked due to repeated failed attempts. Try again later.',
        retryAfterMs: pre.remainingMs ?? 0,
      },
      { status: 423 },
    );
  }

  const result = await medplumPasswordLogin({ email, password });
  if (!result.ok) {
    const lock = recordFailure(email);
    log.info('login_failed', { fp, ip, stage: result.stage, locked: lock.locked });
    if (lock.locked) {
      return NextResponse.json(
        {
          error: 'Too many failed attempts. Your account is locked for 30 minutes.',
          retryAfterMs: lock.remainingMs ?? 0,
        },
        { status: 423 },
      );
    }
    const mapped = STAGE_TO_HTTP[result.stage];
    return NextResponse.json({ error: mapped.msg }, { status: mapped.status });
  }
  const { accessToken, profileId } = result.data;

  // H1: prevent session-fixation. Drop any pre-set cookie payload before
  // writing the new authenticated session.
  const stale = await getSession();
  stale.destroy();
  const session = await getSession();
  session.accessToken = accessToken;
  session.profileId = profileId;
  session.email = email;
  session.createdAt = Date.now();
  bumpIdle(session);
  await session.save();

  recordSuccess(email);
  auditSuccess(profileId, accessToken, ip);
  log.info('login_success', { fp, ip, profileId });

  return NextResponse.json({ ok: true, profileId });
}
