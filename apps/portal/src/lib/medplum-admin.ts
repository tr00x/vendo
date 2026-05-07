import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { MedplumClient } from '@medplum/core';

/**
 * Service-account MedplumClient used by privileged server actions that the
 * calling user's own access token cannot perform — primarily
 * `admin/projects/{id}/invite`, which requires ProjectMembership.admin=true
 * on the requesting principal.
 *
 * Credentials live in env (MEDPLUM_ADMIN_EMAIL / MEDPLUM_ADMIN_PASSWORD) so
 * they are never bundled with client code, never persisted to the FHIR
 * graph, and never returned to the browser.
 *
 * The caller is still responsible for writing the AuditEvent under the
 * *user's* Practitioner reference — this client is the network principal,
 * not the audit subject.
 *
 * Token cache: Medplum access tokens last ~1hr; we reuse a signed-in client
 * for 30 minutes and re-authenticate on the next request after expiry.
 *
 * Sign-in is done via raw fetch + manual PKCE rather than the SDK's
 * startLogin/processCode flow, because those touch `window` and
 * `sessionStorage` — which we can't polyfill globally without breaking
 * styled-jsx into client-mode and crashing SSR.
 */

let cached: { client: MedplumClient; expiresAt: number } | undefined;
const TTL_MS = 30 * 60 * 1000;

interface LoginResp {
  login: string;
  code?: string;
  memberships?: Array<{ id: string }>;
}
interface ProfileResp {
  code?: string;
}
interface TokenResp {
  access_token: string;
  expires_in: number;
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for admin-privileged server actions`);
  return v;
}

async function fetchAccessToken(baseUrl: string, email: string, password: string): Promise<string> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const loginR = await fetch(new URL('auth/login', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
    }),
  });
  if (!loginR.ok) throw new Error(`admin auth/login failed (${loginR.status})`);
  const loginData = (await loginR.json()) as LoginResp;

  let code = loginData.code;
  if (!code) {
    const first = loginData.memberships?.[0];
    if (!first) throw new Error('admin login returned no membership');
    const profileR = await fetch(new URL('auth/profile', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: loginData.login, profile: first.id }),
    });
    if (!profileR.ok) throw new Error(`admin auth/profile failed (${profileR.status})`);
    const profileResp = (await profileR.json()) as ProfileResp;
    code = profileResp.code;
  }
  if (!code) throw new Error('admin login produced no auth code');

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
  });
  const tokenR = await fetch(new URL('oauth2/token', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!tokenR.ok) throw new Error(`admin oauth2/token failed (${tokenR.status})`);
  const tok = (await tokenR.json()) as TokenResp;
  return tok.access_token;
}

export async function getAdminMedplumClient(): Promise<MedplumClient> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.client;

  const baseUrl = requiredEnv('NEXT_PUBLIC_MEDPLUM_BASE_URL');
  const email = requiredEnv('MEDPLUM_ADMIN_EMAIL');
  const password = requiredEnv('MEDPLUM_ADMIN_PASSWORD');

  const token = await fetchAccessToken(baseUrl, email, password);
  const client = new MedplumClient({ baseUrl, fetch });
  client.setAccessToken(token);
  // Prime profile so adminMembership queries can use the resolved id.
  // readResource('Practitioner','me') isn't a thing; instead resolve via
  // the token introspection response. Medplum's MedplumClient.getProfile()
  // returns undefined when only setAccessToken was used. We fetch /auth/me
  // to populate it ourselves.
  try {
    const meR = await fetch(new URL('auth/me', baseUrl), {
      headers: { authorization: `Bearer ${token}` },
    });
    if (meR.ok) {
      const me = (await meR.json()) as { profile?: { resourceType?: string; id?: string } };
      // Medplum's MedplumClient exposes setProfile internally; we attach via
      // a public-ish path. If unavailable, callers fall back to deriving
      // membership via search (still works without a cached profile).
      const profile = me.profile;
      if (profile?.resourceType && profile.id) {
        (client as unknown as { profile?: unknown }).profile = profile;
      }
    }
  } catch {
    // non-fatal; admin client still works for FHIR ops
  }

  cached = { client, expiresAt: now + TTL_MS };
  return client;
}

/** Test/dev only — clears the memo so a credential rotation takes effect
 *  on the next request without restarting the process. */
export function _resetAdminClientCache(): void {
  cached = undefined;
}
