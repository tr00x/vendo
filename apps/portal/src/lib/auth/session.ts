import 'server-only';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface PortalSession {
  accessToken?: string | undefined;
  profileId?: string | undefined;
  email?: string | undefined;
  expiresAt?: number | undefined; // epoch ms — short-lived; used for idle timeout
  createdAt?: number | undefined; // epoch ms — used for max session lifetime
  /**
   * 'password' — accessToken is a user-scoped Medplum token (Medplum's
   * AccessPolicy enforces what the user can read/write).
   * 'magic'    — accessToken is the admin service-account token; we run
   *              FHIR ops on the user's behalf with elevated privileges.
   *              Server actions for magic sessions MUST gate by
   *              session.profileId before returning data; AccessPolicy
   *              is bypassed in this mode.
   * Undefined values predate the magic-link feature; treat as 'password'.
   */
  authMethod?: 'password' | 'magic' | undefined;
}
// Refresh-token rotation is phase-2: when the access token expires mid-session,
// requireSession redirects to /login. Acceptable for phase-1 since absolute
// timeout (12h) is the binding limit anyway.

export type ServerSession = IronSession<PortalSession>;

const SESSION_COOKIE = 'vendo.sid';
const IDLE_MS = 15 * 60 * 1000; // 15 min idle
const MAX_MS = 12 * 60 * 60 * 1000; // 12 hr max

function options(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 chars');
  }
  return {
    password,
    cookieName: SESSION_COOKIE,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: MAX_MS / 1000,
    },
  };
}

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
export async function getSession(): Promise<ServerSession> {
  // iron-session typings still target older Next; cast through unknown.
  const store = (await cookies()) as unknown;
  return getIronSession<PortalSession>(store as any, options());
}
/* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */

export function isExpired(s: PortalSession, now = Date.now()): boolean {
  if (!s.createdAt || !s.expiresAt) return true;
  if (now - s.createdAt > MAX_MS) return true;
  if (now > s.expiresAt) return true;
  return false;
}

export function bumpIdle(s: PortalSession, now = Date.now()): void {
  s.expiresAt = now + IDLE_MS;
}

export async function clearSession(): Promise<void> {
  const s = await getSession();
  s.destroy();
}
