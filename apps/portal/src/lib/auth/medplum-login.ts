import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Server-side Medplum password-login flow, factored out so both
 * /api/auth/login (interactive password) and /api/auth/magic/verify
 * (magic-link, embedded one-time password) can share it.
 *
 * Returns the same shape we put into the iron-session cookie. Errors are
 * narrow strings — callers map them to HTTP status + audit subtype.
 */

interface LoginResp {
  login: string;
  code?: string;
  memberships?: Array<{ id: string; project: { reference: string }; profile: { reference: string } }>;
}

interface ProfileResp {
  login: string;
  code?: string;
}

interface TokenResp {
  access_token: string;
  expires_in: number;
  profile: { reference: string };
}

export type LoginFailure =
  | 'invalid-credentials'
  | 'no-membership'
  | 'profile-failed'
  | 'no-code'
  | 'token-failed'
  | 'malformed-profile';

export interface LoginSuccess {
  accessToken: string;
  profileId: string;
  resourceType: string;
}

export type LoginResult = { ok: true; data: LoginSuccess } | { ok: false; stage: LoginFailure };

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL ?? 'http://localhost:8103/';
}

/**
 * Run the full PKCE-style password login flow on behalf of an
 * already-authenticated *recipient* (or a real user typing a password).
 * Equivalent to MedplumClient.startLogin / processCode but without the
 * SDK's window/sessionStorage dependency, so it's safe in route handlers.
 */
export async function medplumPasswordLogin(args: {
  email: string;
  password: string;
}): Promise<LoginResult> {
  const url = baseUrl();

  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const loginR = await fetch(new URL('auth/login', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: args.email,
      password: args.password,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
    }),
  });
  if (!loginR.ok) return { ok: false, stage: 'invalid-credentials' };
  const loginData = (await loginR.json()) as LoginResp;

  let code = loginData.code;
  if (!code) {
    const firstMembership = loginData.memberships?.[0];
    if (!firstMembership) return { ok: false, stage: 'no-membership' };
    const profileR = await fetch(new URL('auth/profile', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: loginData.login, profile: firstMembership.id }),
    });
    if (!profileR.ok) return { ok: false, stage: 'profile-failed' };
    const profileResp = (await profileR.json()) as ProfileResp;
    code = profileResp.code;
  }
  if (!code) return { ok: false, stage: 'no-code' };

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
  });
  const tokenR = await fetch(new URL('oauth2/token', url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!tokenR.ok) return { ok: false, stage: 'token-failed' };
  const token = (await tokenR.json()) as TokenResp;

  const refParts = token.profile?.reference?.split('/') ?? [];
  const [resourceType, profileId] = refParts;
  if (refParts.length !== 2 || !resourceType || !profileId) {
    return { ok: false, stage: 'malformed-profile' };
  }
  return {
    ok: true,
    data: { accessToken: token.access_token, profileId, resourceType },
  };
}
