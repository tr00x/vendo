'use server';

import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import type { MedplumClient } from '@medplum/core';
import type { Practitioner, ProjectMembership } from '@medplum/fhirtypes';
import { ROLE_SYSTEM, requireSession } from '@/lib/auth/guard';
import { issueMagicLinkToken } from '@/lib/auth/magic-link';
import { formatTime } from '@/lib/format';
import { auditLog } from '@/lib/audit';
import { log } from '@/lib/log';
import { getAdminMedplumClient } from '@/lib/medplum-admin';
import { getEmailTransport } from '@/lib/email/transport';
import {
  BRAND,
  magicLinkTemplate,
  passwordResetTemplate,
  welcomeReferrerTemplate,
} from '@/lib/email/templates';
import {
  DeactivateReferrerSchema,
  type DeactivateReferrerInput,
  InviteReferrerSchema,
  type InviteReferrerInput,
  type InviteReferrerResult,
  ReactivateReferrerSchema,
  type ReactivateReferrerInput,
  type ReferrerActionResult,
  ResetReferrerPasswordSchema,
  type ResetReferrerPasswordInput,
  SendMagicLinkSchema,
  type SendMagicLinkInput,
  type SendMagicLinkResult,
  UpdateReferrerSchema,
  type UpdateReferrerInput,
} from './referrer-types';

interface InviteResp {
  profile?: { reference?: string };
}

/** Heuristic match for Medplum's "User already exists" 400-style error. */
function isDuplicateUserError(err: unknown): boolean {
  const msg = String(err);
  return /already\s+exists/i.test(msg) || /email\s+(?:is\s+)?(?:already\s+)?taken/i.test(msg);
}

/** Allow only ClinicStaff or Admin to call into referrer management.
 *  Returns the session context on success, or an error result the action
 *  can return verbatim. Audit-logs denied attempts under the caller. */
async function authorizeManager(subtype: string, targetReference: string) {
  const ctx = await requireSession();
  if (ctx.role !== 'Admin' && ctx.role !== 'ClinicStaff') {
    auditLog({
      medplum: ctx.medplum,
      agent: ctx.profile,
      action: 'U',
      target: { reference: targetReference },
      subtype: `${subtype}-denied`,
      outcome: '8',
    });
    return { denied: true as const, error: 'Only clinic staff or an admin can manage referrers' };
  }
  return { denied: false as const, ctx };
}

/** Resolve the projectId via the admin service-account's own admin=true
 *  ProjectMembership. Same pattern as inviteReferrerAction. */
async function resolveProjectId(admin: MedplumClient): Promise<string | undefined> {
  const memberships = (await admin.searchResources(
    'ProjectMembership',
    '_count=20',
  )) as ProjectMembership[];
  const adminMembership = memberships.find(
    (m) => (m as { admin?: boolean }).admin === true && Boolean(m.project?.reference),
  );
  return adminMembership?.project?.reference?.split('/')[1];
}

/** Find the User.id linked to a Practitioner via ProjectMembership.profile.
 *  Required by auth/setpassword, which addresses the User resource directly. */
async function findUserIdForPractitioner(
  admin: MedplumClient,
  practitionerId: string,
): Promise<string | undefined> {
  const memberships = (await admin.searchResources(
    'ProjectMembership',
    `profile=Practitioner/${practitionerId}&_count=2`,
  )) as ProjectMembership[];
  return memberships[0]?.user?.reference?.split('/')[1];
}

/** Confirm the target Practitioner is a Referrer (not staff/admin). Prevents
 *  ClinicStaff from accidentally rotating another staff member's password
 *  through the referrers UI. */
function assertReferrer(p: Practitioner): boolean {
  const tag = p.identifier?.find((i) => i.system === ROLE_SYSTEM)?.value;
  if (tag === 'ClinicStaff' || tag === 'Admin') return false;
  if (tag === 'Referrer') return true;
  // Untagged but practice-only — allow, mirrors ReferrersPage.isReferrer.
  const practice = p.qualification?.[0]?.code?.text ?? '';
  if (!practice) return false;
  if (/Front Desk|Clinic Staff|Imaging Clinic —/i.test(practice)) return false;
  return true;
}

function staffDisplayName(p: Practitioner): string | undefined {
  const n = p.name?.[0];
  if (!n) return undefined;
  const given = (n.given ?? []).join(' ').trim();
  const family = n.family?.trim() ?? '';
  const composed = `${given} ${family}`.trim();
  return composed.length > 0 ? composed : undefined;
}

/** Fire-and-forget — never blocks the action result. Failures are logged
 *  + audited; we don't roll back the underlying account change just
 *  because the courtesy email didn't go out. */
function fireEmail(
  medplum: MedplumClient,
  agent: Practitioner,
  to: string,
  toName: string,
  subtype: string,
  content: { subject: string; text: string; html: string },
): void {
  void (async () => {
    try {
      const transport = getEmailTransport();
      const result = await transport.send({
        to,
        toName,
        replyTo: BRAND.supportEmail,
        content,
      });
      log.info('referrer_email_sent', {
        subtype,
        to,
        transport: transport.name,
        ok: result.ok,
        id: result.id ?? null,
        error: result.error ?? null,
      });
      auditLog({
        medplum,
        agent,
        action: 'E',
        target: { reference: `mailto:${to}` },
        subtype,
        outcome: result.ok ? '0' : '4',
      });
    } catch (e) {
      log.error('referrer_email_failed', { subtype, to, error: String(e) });
    }
  })();
}

function generateRandomPassword(): string {
  // 24-byte URL-safe random — comfortably exceeds the 12-char policy floor
  // and is unguessable. Used to lock out a deactivated referrer immediately
  // even before the admin removes ProjectMembership.
  return randomBytes(24).toString('base64url');
}

export async function inviteReferrerAction(
  input: InviteReferrerInput,
): Promise<InviteReferrerResult> {
  const parsed = InviteReferrerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const data = parsed.data;

  const ctx = await requireSession();
  // Both ClinicStaff (front desk) and Admin (project owner) can invite.
  // The actual privileged Medplum call goes through a service-account
  // client (MEDPLUM_ADMIN_EMAIL/MEDPLUM_ADMIN_PASSWORD), since
  // ProjectMembership.admin=true is what the invite endpoint enforces —
  // not the AccessPolicy that gates the user's own session. Audit is
  // still written under the calling user, so the trail honestly reflects
  // who initiated the action vs. which network principal carried it out.
  if (ctx.role !== 'Admin' && ctx.role !== 'ClinicStaff') {
    auditLog({
      medplum: ctx.medplum,
      agent: ctx.profile,
      action: 'C',
      target: { reference: `mailto:${data.email}` },
      subtype: 'invite-referrer-denied',
      outcome: '8',
    });
    return { ok: false, error: 'Only clinic staff or an admin can invite referrers' };
  }
  const { medplum: userMedplum, profile } = ctx;
  let practitionerId: string | undefined;

  let admin;
  try {
    admin = await getAdminMedplumClient();
  } catch (e) {
    log.error('referrer_invite_admin_unavailable', { error: String(e) });
    return {
      ok: false,
      error: 'Invite is unavailable — admin service-account is not configured.',
    };
  }

  try {
    const projectId = await resolveProjectId(admin);
    if (!projectId) return { ok: false, error: 'Could not resolve admin project for service-account' };

    const policy = await admin.searchOne('AccessPolicy', 'name=Referrer');
    if (!policy?.id) return { ok: false, error: 'Referrer access policy is missing — re-run seed' };

    // Pre-flight dup check — Medplum returns a generic 400 with no useful
    // body on dup, so we surface a friendly message ourselves. Done via the
    // admin client because ClinicStaff cannot read other Practitioners'
    // email field. The catch below also parses the API error string in
    // case a User exists without a Practitioner attached (a state this
    // Practitioner-only search misses).
    const existing = (await admin.searchResources(
      'Practitioner',
      `email=${encodeURIComponent(data.email)}`,
    )) as Practitioner[];
    if (existing.length > 0) {
      return { ok: false, error: 'A user with this email already exists' };
    }

    // Password is chosen by staff in the form (zod-validated min 12 chars).
    // Medplum stores it as bcrypt; we never persist or log the plaintext.
    const r = (await admin.post(`admin/projects/${projectId}/invite`, {
      resourceType: 'Practitioner',
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
      sendEmail: false,
      membership: {
        access: [{ policy: { reference: `AccessPolicy/${policy.id}` } }],
      },
    })) as InviteResp;

    practitionerId = r.profile?.reference?.split('/')[1];
    if (!practitionerId) {
      log.error('referrer_invite_malformed_response', { response: JSON.stringify(r).slice(0, 200) });
      return { ok: false, error: 'Invite failed — unexpected response from Medplum' };
    }

    // Tag the new Practitioner with role + telecom + qualification so role
    // detection (guard.ts → roleFromPractitioner) and inbox display work.
    // Wrapped in its own try because the User+Practitioner already exist at
    // this point — failure here means a half-built account, which staff
    // needs to know about (and the auditor needs to see).
    try {
      const p = await admin.readResource('Practitioner', practitionerId);
      const telecom = [
        { system: 'email' as const, value: data.email },
        ...(data.phone ? [{ system: 'phone' as const, value: data.phone }] : []),
      ];
      const qualification = data.practice
        ? [{ code: { text: data.practice }, issuer: { display: data.practice } }]
        : (p.qualification ?? []);
      const identifier = [
        ...(p.identifier ?? []).filter((i) => i.system !== ROLE_SYSTEM),
        { system: ROLE_SYSTEM, value: 'Referrer' },
      ];
      await admin.updateResource({ ...p, identifier, telecom, qualification, active: true });
    } catch (tagErr) {
      log.error('referrer_invite_tag_failed', { practitionerId, error: String(tagErr) });
      auditLog({
        medplum: userMedplum,
        agent: profile,
        action: 'C',
        target: { reference: `Practitioner/${practitionerId}` },
        subtype: 'invite-referrer-tag-failed',
        outcome: '4',
      });
      return {
        ok: false,
        error: `Account created for ${data.email} but role tagging failed — finish setup in Medplum admin.`,
      };
    }

    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'C',
      target: { reference: `Practitioner/${practitionerId}` },
      subtype: 'invite-referrer',
    });
    log.info('referrer_invited', { practitionerId, invitedBy: profile.id });

    // Courtesy welcome email — carries the staff-chosen password since
    // Medplum's invite ran with sendEmail:false. Fire-and-forget so a
    // mail-server outage doesn't break the invite.
    fireEmail(
      userMedplum,
      profile,
      data.email,
      `${data.firstName} ${data.lastName}`.trim(),
      'invite-referrer-email',
      welcomeReferrerTemplate({
        doctor: { given: data.firstName, family: data.lastName },
        email: data.email,
        password: data.password,
        invitedByName: staffDisplayName(profile),
      }),
    );

    revalidatePath('/clinic/referrers');
    return { ok: true, practitionerId, email: data.email };
  } catch (e) {
    log.error('referrer_invite_failed', { error: String(e) });
    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'C',
      target: { reference: practitionerId ? `Practitioner/${practitionerId}` : `mailto:${data.email}` },
      subtype: 'invite-referrer-failed',
      outcome: '8',
    });
    if (isDuplicateUserError(e)) {
      return { ok: false, error: 'A user with this email already exists' };
    }
    return { ok: false, error: 'Failed to invite referrer — see logs' };
  }
}

// ---------- update referrer profile (name / phone / practice) ----------

export async function updateReferrerAction(
  input: UpdateReferrerInput,
): Promise<ReferrerActionResult> {
  const parsed = UpdateReferrerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const data = parsed.data;

  const auth = await authorizeManager('update-referrer', `Practitioner/${data.practitionerId}`);
  if (auth.denied) return { ok: false, error: auth.error };
  const { medplum: userMedplum, profile } = auth.ctx;

  let admin;
  try {
    admin = await getAdminMedplumClient();
  } catch (e) {
    log.error('referrer_update_admin_unavailable', { error: String(e) });
    return { ok: false, error: 'Update is unavailable — admin service-account is not configured.' };
  }

  try {
    const p = await admin.readResource('Practitioner', data.practitionerId);
    if (!assertReferrer(p)) {
      auditLog({
        medplum: userMedplum,
        agent: profile,
        action: 'U',
        target: { reference: `Practitioner/${data.practitionerId}` },
        subtype: 'update-referrer-not-referrer',
        outcome: '8',
      });
      return { ok: false, error: 'Target is not a referrer account' };
    }

    const existingEmail = p.telecom?.find((t) => t.system === 'email')?.value;
    const telecom = [
      ...(existingEmail ? [{ system: 'email' as const, value: existingEmail }] : []),
      ...(data.phone ? [{ system: 'phone' as const, value: data.phone }] : []),
    ];
    const qualification = data.practice
      ? [{ code: { text: data.practice }, issuer: { display: data.practice } }]
      : [];

    await admin.updateResource({
      ...p,
      name: [{ given: [data.firstName], family: data.lastName }],
      telecom,
      qualification,
    });

    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'U',
      target: { reference: `Practitioner/${data.practitionerId}` },
      subtype: 'update-referrer',
    });
    log.info('referrer_updated', { practitionerId: data.practitionerId, updatedBy: profile.id });

    revalidatePath('/clinic/referrers');
    return { ok: true };
  } catch (e) {
    log.error('referrer_update_failed', { error: String(e), practitionerId: data.practitionerId });
    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'U',
      target: { reference: `Practitioner/${data.practitionerId}` },
      subtype: 'update-referrer-failed',
      outcome: '8',
    });
    return { ok: false, error: 'Failed to update referrer — see logs' };
  }
}

// ---------- reset password (admin-mediated) ----------

export async function resetReferrerPasswordAction(
  input: ResetReferrerPasswordInput,
): Promise<ReferrerActionResult> {
  const parsed = ResetReferrerPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const data = parsed.data;

  const auth = await authorizeManager(
    'reset-referrer-password',
    `Practitioner/${data.practitionerId}`,
  );
  if (auth.denied) return { ok: false, error: auth.error };
  const { medplum: userMedplum, profile } = auth.ctx;

  let admin;
  try {
    admin = await getAdminMedplumClient();
  } catch (e) {
    log.error('referrer_setpassword_admin_unavailable', { error: String(e) });
    return { ok: false, error: 'Reset is unavailable — admin service-account is not configured.' };
  }

  try {
    const p = await admin.readResource('Practitioner', data.practitionerId);
    if (!assertReferrer(p)) {
      auditLog({
        medplum: userMedplum,
        agent: profile,
        action: 'U',
        target: { reference: `Practitioner/${data.practitionerId}` },
        subtype: 'reset-referrer-password-not-referrer',
        outcome: '8',
      });
      return { ok: false, error: 'Target is not a referrer account' };
    }

    const userId = await findUserIdForPractitioner(admin, data.practitionerId);
    if (!userId) {
      return {
        ok: false,
        error: 'Could not find the user account linked to this referrer',
      };
    }

    // POST /auth/setpassword — Medplum's admin-mediated password change.
    // Body fields are intentionally minimal; never log the plaintext.
    await admin.post('auth/setpassword', { id: userId, password: data.password });

    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'U',
      target: { reference: `Practitioner/${data.practitionerId}` },
      subtype: 'reset-referrer-password',
    });
    log.info('referrer_password_reset', {
      practitionerId: data.practitionerId,
      resetBy: profile.id,
    });

    // Notify the referrer with the new password. Fire-and-forget — same
    // tradeoff as the invite welcome email.
    const recipientEmail = p.telecom?.find((t) => t.system === 'email')?.value;
    const recipientName = staffDisplayName(p) ?? recipientEmail ?? 'Doctor';
    if (recipientEmail) {
      const given = (p.name?.[0]?.given?.[0] ?? '').trim();
      const family = (p.name?.[0]?.family ?? '').trim();
      fireEmail(
        userMedplum,
        profile,
        recipientEmail,
        recipientName,
        'reset-referrer-password-email',
        passwordResetTemplate({
          doctor: { given, family },
          email: recipientEmail,
          password: data.password,
          resetByName: staffDisplayName(profile),
        }),
      );
    }

    revalidatePath('/clinic/referrers');
    return { ok: true };
  } catch (e) {
    log.error('referrer_setpassword_failed', {
      error: String(e),
      practitionerId: data.practitionerId,
    });
    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'U',
      target: { reference: `Practitioner/${data.practitionerId}` },
      subtype: 'reset-referrer-password-failed',
      outcome: '8',
    });
    return { ok: false, error: 'Failed to reset password — see logs' };
  }
}

// ---------- deactivate (block sign-in + flag inactive) ----------

export async function deactivateReferrerAction(
  input: DeactivateReferrerInput,
): Promise<ReferrerActionResult> {
  const parsed = DeactivateReferrerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const data = parsed.data;

  const auth = await authorizeManager(
    'deactivate-referrer',
    `Practitioner/${data.practitionerId}`,
  );
  if (auth.denied) return { ok: false, error: auth.error };
  const { medplum: userMedplum, profile } = auth.ctx;

  let admin;
  try {
    admin = await getAdminMedplumClient();
  } catch (e) {
    log.error('referrer_deactivate_admin_unavailable', { error: String(e) });
    return {
      ok: false,
      error: 'Deactivate is unavailable — admin service-account is not configured.',
    };
  }

  try {
    const p = await admin.readResource('Practitioner', data.practitionerId);
    if (!assertReferrer(p)) {
      auditLog({
        medplum: userMedplum,
        agent: profile,
        action: 'U',
        target: { reference: `Practitioner/${data.practitionerId}` },
        subtype: 'deactivate-referrer-not-referrer',
        outcome: '8',
      });
      return { ok: false, error: 'Target is not a referrer account' };
    }

    const userId = await findUserIdForPractitioner(admin, data.practitionerId);
    // Rotate password to a random secret so an existing session (or remembered
    // password) can no longer be used, even if removing the membership fails
    // for any reason. Done first because it's the actual security boundary.
    if (userId) {
      try {
        await admin.post('auth/setpassword', {
          id: userId,
          password: generateRandomPassword(),
        });
      } catch (pwErr) {
        log.warn('referrer_deactivate_password_rotation_failed', {
          practitionerId: data.practitionerId,
          error: String(pwErr),
        });
      }
    }

    // Flag the Practitioner inactive — surfaces in the UI as the "Inactive"
    // badge and prevents the role detector from treating them as an active
    // member. Practitioner.active is a standard FHIR field.
    await admin.updateResource({ ...p, active: false });

    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'U',
      target: { reference: `Practitioner/${data.practitionerId}` },
      subtype: 'deactivate-referrer',
    });
    log.info('referrer_deactivated', {
      practitionerId: data.practitionerId,
      deactivatedBy: profile.id,
    });

    revalidatePath('/clinic/referrers');
    return { ok: true };
  } catch (e) {
    log.error('referrer_deactivate_failed', {
      error: String(e),
      practitionerId: data.practitionerId,
    });
    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'U',
      target: { reference: `Practitioner/${data.practitionerId}` },
      subtype: 'deactivate-referrer-failed',
      outcome: '8',
    });
    return { ok: false, error: 'Failed to deactivate referrer — see logs' };
  }
}

// ---------- reactivate (active=true + new staff-set password) ----------

export async function reactivateReferrerAction(
  input: ReactivateReferrerInput,
): Promise<ReferrerActionResult> {
  const parsed = ReactivateReferrerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const data = parsed.data;

  const auth = await authorizeManager(
    'reactivate-referrer',
    `Practitioner/${data.practitionerId}`,
  );
  if (auth.denied) return { ok: false, error: auth.error };
  const { medplum: userMedplum, profile } = auth.ctx;

  let admin;
  try {
    admin = await getAdminMedplumClient();
  } catch (e) {
    log.error('referrer_reactivate_admin_unavailable', { error: String(e) });
    return {
      ok: false,
      error: 'Reactivate is unavailable — admin service-account is not configured.',
    };
  }

  try {
    const p = await admin.readResource('Practitioner', data.practitionerId);
    if (!assertReferrer(p)) {
      auditLog({
        medplum: userMedplum,
        agent: profile,
        action: 'U',
        target: { reference: `Practitioner/${data.practitionerId}` },
        subtype: 'reactivate-referrer-not-referrer',
        outcome: '8',
      });
      return { ok: false, error: 'Target is not a referrer account' };
    }

    const userId = await findUserIdForPractitioner(admin, data.practitionerId);
    if (!userId) {
      return {
        ok: false,
        error: 'Could not find the user account linked to this referrer',
      };
    }

    await admin.post('auth/setpassword', { id: userId, password: data.password });
    await admin.updateResource({ ...p, active: true });

    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'U',
      target: { reference: `Practitioner/${data.practitionerId}` },
      subtype: 'reactivate-referrer',
    });
    log.info('referrer_reactivated', {
      practitionerId: data.practitionerId,
      reactivatedBy: profile.id,
    });

    // Same shape as a password-reset email — referrer needs the new
    // credential to sign back in.
    const recipientEmail = p.telecom?.find((t) => t.system === 'email')?.value;
    const recipientName = staffDisplayName(p) ?? recipientEmail ?? 'Doctor';
    if (recipientEmail) {
      const given = (p.name?.[0]?.given?.[0] ?? '').trim();
      const family = (p.name?.[0]?.family ?? '').trim();
      fireEmail(
        userMedplum,
        profile,
        recipientEmail,
        recipientName,
        'reactivate-referrer-email',
        passwordResetTemplate({
          doctor: { given, family },
          email: recipientEmail,
          password: data.password,
          resetByName: staffDisplayName(profile),
        }),
      );
    }

    revalidatePath('/clinic/referrers');
    return { ok: true };
  } catch (e) {
    log.error('referrer_reactivate_failed', {
      error: String(e),
      practitionerId: data.practitionerId,
    });
    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'U',
      target: { reference: `Practitioner/${data.practitionerId}` },
      subtype: 'reactivate-referrer-failed',
      outcome: '8',
    });
    return { ok: false, error: 'Failed to reactivate referrer — see logs' };
  }
}

// ---------- send magic link (one-tap sign-in) ----------

/** Resolve the canonical portal origin used to build the magic-link URL.
 *  Prefer NEXT_PUBLIC_APP_BASE_URL (set per deployment) and fall back to
 *  the branded portal URL — the email's "Sign in" CTA must point at the
 *  user's actual portal, never the development host. */
function portalOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  return BRAND.portalUrl.replace(/\/+$/, '');
}

export async function sendMagicLinkAction(
  input: SendMagicLinkInput,
): Promise<SendMagicLinkResult> {
  const parsed = SendMagicLinkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const data = parsed.data;

  const auth = await authorizeManager(
    'send-magic-link',
    `Practitioner/${data.practitionerId}`,
  );
  if (auth.denied) return { ok: false, error: auth.error };
  const { medplum: userMedplum, profile } = auth.ctx;

  let admin;
  try {
    admin = await getAdminMedplumClient();
  } catch (e) {
    log.error('referrer_magic_link_admin_unavailable', { error: String(e) });
    return {
      ok: false,
      error: 'Sign-in link is unavailable — admin service-account is not configured.',
    };
  }

  try {
    const p = await admin.readResource('Practitioner', data.practitionerId);
    if (!assertReferrer(p)) {
      auditLog({
        medplum: userMedplum,
        agent: profile,
        action: 'E',
        target: { reference: `Practitioner/${data.practitionerId}` },
        subtype: 'send-magic-link-not-referrer',
        outcome: '8',
      });
      return { ok: false, error: 'Target is not a referrer account' };
    }

    const recipientEmail = p.telecom?.find((t) => t.system === 'email')?.value;
    if (!recipientEmail) {
      return { ok: false, error: 'This referrer has no email on file' };
    }

    // Magic-link sessions are authenticated by signed JWT alone — the
    // verify route seats the recipient against the admin service-account
    // token, so we don't need to rotate any Medplum password here. This
    // means the recipient's existing password (if any) stays valid.
    const issued = issueMagicLinkToken({
      practitionerId: data.practitionerId,
      email: recipientEmail,
    });

    // Send synchronously: the email IS the action. SMTP failure must
    // surface to the operator (vs. the fire-and-forget courtesy emails
    // elsewhere) so they can retry.
    const url = `${portalOrigin()}/api/auth/magic/verify?token=${encodeURIComponent(issued.token)}`;
    const expiresLabel = formatTime(issued.expiresAt.toISOString());

    const recipientName = staffDisplayName(p) ?? recipientEmail;
    const given = (p.name?.[0]?.given?.[0] ?? '').trim();
    const family = (p.name?.[0]?.family ?? '').trim();
    const content = magicLinkTemplate({
      doctor: { given, family },
      email: recipientEmail,
      url,
      expiresLabel,
      sentByName: staffDisplayName(profile),
    });

    const transport = getEmailTransport();
    const result = await transport.send({
      to: recipientEmail,
      toName: recipientName,
      replyTo: BRAND.supportEmail,
      content,
    });
    log.info('referrer_magic_link_sent', {
      practitionerId: data.practitionerId,
      transport: transport.name,
      ok: result.ok,
      id: result.id ?? null,
      jti: issued.jti,
      sentBy: profile.id,
    });
    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'E',
      target: { reference: `mailto:${recipientEmail}` },
      subtype: 'send-magic-link-email',
      outcome: result.ok ? '0' : '4',
    });
    if (!result.ok) {
      return {
        ok: false,
        error: 'Could not deliver the sign-in link email — please try again or set a password instead.',
      };
    }

    revalidatePath('/clinic/referrers');
    return { ok: true, email: recipientEmail, expiresAtIso: issued.expiresAt.toISOString() };
  } catch (e) {
    log.error('referrer_magic_link_failed', {
      error: String(e),
      practitionerId: data.practitionerId,
    });
    auditLog({
      medplum: userMedplum,
      agent: profile,
      action: 'E',
      target: { reference: `Practitioner/${data.practitionerId}` },
      subtype: 'send-magic-link-failed',
      outcome: '8',
    });
    return { ok: false, error: 'Failed to send sign-in link — see logs' };
  }
}
