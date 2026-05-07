import type { MedplumClient } from '@medplum/core';

interface ThrottleErr {
  outcome?: { issue?: Array<{ code?: string; diagnostics?: string }> };
}

/** Medplum dev-mode rate-limits auth at 5 logins/min. Back off and retry. */
export async function retryOnThrottle<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as ThrottleErr;
      const issue = e.outcome?.issue?.[0];
      if (issue?.code !== 'throttled') throw err;
      const match = issue.diagnostics?.match(/_msBeforeNext":(\d+)/);
      const wait = match ? Math.min(60_000, parseInt(match[1]!, 10) + 500) : 5000;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return fn();
}

/**
 * Sign in to Medplum with email + password and complete the auth code exchange so
 * the client carries an access token. Medplum 3.x exposes `startLogin` (initiates)
 * and `processCode` (finalizes); this helper wraps both.
 */
export async function signInPassword(
  client: MedplumClient,
  email: string,
  password: string,
): Promise<void> {
  const resp = await retryOnThrottle(() => client.startLogin({ email, password }));
  if (resp.code) {
    await client.processCode(resp.code);
    return;
  }
  if (resp.memberships && resp.memberships.length > 0) {
    // No code yet — must select a membership before exchange.
    const membership = resp.memberships[0]!;
    const profileResp = await client.post('auth/profile', {
      login: resp.login,
      profile: membership.id,
    });
    const code = (profileResp as { code?: string }).code;
    if (code) await client.processCode(code);
    return;
  }
  throw new Error('Login response had neither code nor memberships');
}
