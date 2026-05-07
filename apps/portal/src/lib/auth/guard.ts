import 'server-only';
import { redirect } from 'next/navigation';
import type { MedplumClient } from '@medplum/core';
import type { Practitioner } from '@medplum/fhirtypes';
import { getServerMedplumClient } from '../medplum';
import { bumpIdle, getSession, isExpired, type PortalSession } from './session';

export type Role = 'Referrer' | 'ClinicStaff' | 'Admin' | 'Unknown';

export interface AuthContext {
  medplum: MedplumClient;
  profile: Practitioner;
  session: PortalSession;
  role: Role;
}

export const ROLE_SYSTEM = 'http://vendo.local/role';

/**
 * Detect role from the user's Practitioner.identifier — tagged at invite
 * time. We can't read ProjectMembership / AccessPolicy from a referrer or
 * clinic-staff context (those resources aren't in their AccessPolicy), so
 * we encode the role on a resource they CAN read: their own Practitioner
 * profile (Practitioner?_id=%profile.id).
 */
function roleFromPractitioner(profile: Practitioner): Role {
  const tag = profile.identifier?.find((i) => i.system === ROLE_SYSTEM)?.value;
  if (tag === 'ClinicStaff') return 'ClinicStaff';
  if (tag === 'Referrer') return 'Referrer';
  if (tag === 'Admin') return 'Admin';
  // Fallback for older fixtures — use the practice text marker.
  const practice = profile.qualification?.[0]?.code?.text ?? '';
  if (/Front Desk|Clinic Staff|Imaging Clinic —/i.test(practice)) return 'ClinicStaff';
  if (practice) return 'Referrer';
  return 'Unknown';
}

/**
 * The project owner's Practitioner has no role identifier and no
 * qualification, so it falls through to 'Unknown' above. We resolve admin
 * separately by checking ProjectMembership.admin — only project admins can
 * read their own ProjectMembership in any meaningful way; for non-admins
 * Medplum either returns an empty bundle (no AccessPolicy entry) or a
 * membership without admin=true.
 */
async function detectAdmin(medplum: MedplumClient, profileId: string): Promise<boolean> {
  try {
    const memberships = await medplum.searchResources(
      'ProjectMembership',
      `profile=Practitioner/${profileId}`,
    );
    return memberships.some((m) => (m as { admin?: boolean }).admin === true);
  } catch {
    return false;
  }
}

/**
 * Server-Component-safe session check. Reads the session; if missing/expired
 * or the access token can't read the profile, redirects to /login.
 *
 * Does NOT modify the cookie — Next 15 forbids cookie writes from Server
 * Components. Idle-bump is the responsibility of Server Actions and Route
 * Handlers (see touchSession below).
 */
export async function requireSession(): Promise<AuthContext> {
  const session = await getSession();
  if (!session.accessToken || !session.profileId || isExpired(session)) {
    redirect('/login');
  }
  const medplum = getServerMedplumClient(session.accessToken);
  let profile: Practitioner;
  try {
    profile = await medplum.readResource('Practitioner', session.profileId);
  } catch {
    redirect('/login');
  }
  let role = roleFromPractitioner(profile);
  // Admin's Practitioner has no role-tag, falls through to 'Unknown'. Promote
  // to 'Admin' if ProjectMembership.admin says so. Skip the extra request
  // when we already have a definite role from the identifier/qualification.
  if (role === 'Unknown' && session.profileId) {
    if (await detectAdmin(medplum, session.profileId)) role = 'Admin';
  }
  return { medplum, profile, session, role };
}

/** Gate for the /clinic/* surface — allows ClinicStaff (front desk) and
 *  Admin (project owner/operator). Referrers bounce to their own dashboard. */
export async function requireClinicStaff(): Promise<AuthContext> {
  const ctx = await requireSession();
  if (ctx.role !== 'ClinicStaff' && ctx.role !== 'Admin') redirect('/dashboard');
  return ctx;
}

/**
 * Idle-bump helper. Call from Server Actions or Route Handlers only — these
 * are the only contexts where Next 15 allows cookie modification.
 */
export async function touchSession(): Promise<void> {
  const session = await getSession();
  if (!session.accessToken || isExpired(session)) return;
  bumpIdle(session);
  await session.save();
}

/** Read-only helper used by middleware that cannot persist. */
export async function peekSession(): Promise<PortalSession | undefined> {
  const session = await getSession();
  if (!session.accessToken || isExpired(session)) return undefined;
  return session;
}

/** Stricter check — used by /login to avoid the redirect loop where a stale
 *  cookie passes peek (timestamp not yet expired) but the access token is
 *  rejected by the API. Validates by calling readResource on the profile;
 *  returns undefined for any failure so login renders the form rather than
 *  bouncing the user to /r → requireSession → /login. */
export async function peekValidatedSession(): Promise<PortalSession | undefined> {
  const session = await peekSession();
  if (!session?.accessToken || !session.profileId) return undefined;
  try {
    const medplum = getServerMedplumClient(session.accessToken);
    await medplum.readResource('Practitioner', session.profileId);
    return session;
  } catch {
    return undefined;
  }
}
