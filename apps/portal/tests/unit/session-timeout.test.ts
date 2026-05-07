import { describe, it, expect } from 'vitest';
import { isExpired, bumpIdle, type PortalSession } from '@/lib/auth/session';

const MIN = 60_000;
const HOUR = 60 * MIN;

function fresh(now: number): PortalSession {
  return { accessToken: 'a', profileId: 'p', createdAt: now, expiresAt: now + 15 * MIN };
}

describe('session timeout', () => {
  it('fresh session is not expired', () => {
    const now = Date.now();
    expect(isExpired(fresh(now), now)).toBe(false);
  });

  it('idle past 15 min is expired', () => {
    const now = Date.now();
    const s = fresh(now);
    expect(isExpired(s, now + 16 * MIN)).toBe(true);
  });

  it('absolute past 12 hr is expired even if idle was bumped', () => {
    const now = Date.now();
    const s: PortalSession = {
      accessToken: 'a',
      profileId: 'p',
      createdAt: now,
      expiresAt: now + 13 * HOUR,
    };
    expect(isExpired(s, now + 13 * HOUR)).toBe(true);
  });

  it('missing tokens count as expired', () => {
    expect(isExpired({})).toBe(true);
  });

  it('bumpIdle pushes expiresAt forward by 15 min', () => {
    const now = 1_000_000_000;
    const s: PortalSession = { createdAt: now };
    bumpIdle(s, now);
    expect(s.expiresAt).toBe(now + 15 * MIN);
  });
});

describe('scrubPhi', () => {
  it('redacts emails and phones from strings', async () => {
    const { scrubPhi } = await import('@/lib/phi-scrub');
    expect(scrubPhi('contact me at jane@example.com or +1 555-1212')).toBe(
      'contact me at <email> or <phone>',
    );
  });

  it('redacts known PHI keys', async () => {
    const { scrubPhi } = await import('@/lib/phi-scrub');
    expect(scrubPhi({ name: [{ family: 'X' }], birthDate: '1990' })).toEqual({
      name: '<redacted>',
      birthDate: '<redacted>',
    });
  });
});
