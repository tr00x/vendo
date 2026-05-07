import { describe, expect, it, beforeEach } from 'vitest';
import {
  MAX_FAILS,
  lockoutStatus,
  recordFailure,
  recordSuccess,
  _resetLockoutState,
} from '@/lib/auth/lockout';

describe('login lockout', () => {
  const email = 'attacker@example.com';

  beforeEach(() => {
    _resetLockoutState();
  });

  it('starts unlocked with 0 fail count', () => {
    expect(lockoutStatus(email)).toEqual({ locked: false, failCount: 0 });
  });

  it(`locks after ${MAX_FAILS} consecutive failures`, () => {
    for (let i = 0; i < MAX_FAILS - 1; i++) {
      const s = recordFailure(email);
      expect(s.locked).toBe(false);
    }
    const final = recordFailure(email);
    expect(final.locked).toBe(true);
    expect(final.remainingMs).toBeGreaterThan(0);
  });

  it('clears failures on success', () => {
    recordFailure(email);
    recordFailure(email);
    recordSuccess(email);
    expect(lockoutStatus(email).failCount).toBe(0);
  });

  it('treats email case-insensitively', () => {
    for (let i = 0; i < MAX_FAILS; i++) recordFailure(email.toUpperCase());
    expect(lockoutStatus(email.toLowerCase()).locked).toBe(true);
  });

  it('reports remaining lock time monotonically', () => {
    for (let i = 0; i < MAX_FAILS; i++) recordFailure(email);
    const t1 = Date.now();
    const s1 = lockoutStatus(email, t1);
    const s2 = lockoutStatus(email, t1 + 5000);
    expect(s1.remainingMs).toBeGreaterThan(s2.remainingMs ?? 0);
  });
});
