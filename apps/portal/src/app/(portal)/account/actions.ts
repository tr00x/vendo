'use server';

import { requireSession } from '@/lib/auth/guard';
import { auditLog } from '@/lib/audit';
import { log } from '@/lib/log';

interface Result {
  ok: boolean;
  error?: string;
}

/** Change the signed-in user's password.
 *  Mirrors Medplum's POST /auth/changepassword which validates the old
 *  password server-side and rotates the credential. We don't ever see or
 *  log the actual passwords — only success/failure plus the audit trail. */
export async function changePasswordAction(
  oldPassword: string,
  newPassword: string,
): Promise<Result> {
  if (!oldPassword || !newPassword) {
    return { ok: false, error: 'Both fields are required.' };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters.' };
  }
  if (oldPassword === newPassword) {
    return { ok: false, error: 'New password must be different from the current one.' };
  }

  try {
    const { medplum, profile } = await requireSession();
    await medplum.post('auth/changepassword', { oldPassword, newPassword });
    auditLog({
      medplum,
      agent: profile,
      action: 'U',
      target: { reference: `Practitioner/${profile.id}` },
      subtype: 'password-change',
    });
    log.info('password_changed', { practitionerId: profile.id });
    return { ok: true };
  } catch (e) {
    // Medplum returns 400 on wrong old password — surface a non-leaky message.
    const msg = (e as { outcome?: { issue?: Array<{ details?: { text?: string } }> } })
      ?.outcome?.issue?.[0]?.details?.text;
    log.warn('password_change_failed', { error: String(e) });
    if (typeof msg === 'string' && /password|invalid|incorrect/i.test(msg)) {
      return { ok: false, error: 'Current password is incorrect.' };
    }
    return { ok: false, error: 'Could not change password. Please try again.' };
  }
}
