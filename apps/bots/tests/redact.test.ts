import { describe, it, expect } from 'vitest';
import { redact, hashEmail } from '../src/lib/redact.js';

describe('redact', () => {
  it('redacts top-level PHI keys', () => {
    expect(redact({ name: [{ family: 'X' }], birthDate: '1990' })).toEqual({
      name: '<redacted>',
      birthDate: '<redacted>',
    });
  });
  it('redacts nested PHI', () => {
    expect(redact({ patient: { telecom: [{ value: 'a' }] } })).toMatchObject({
      patient: { telecom: '<redacted>' },
    });
  });
});

describe('hashEmail', () => {
  it('produces a stable hex hash', () => {
    const h1 = hashEmail('a@b.com');
    const h2 = hashEmail('A@B.COM');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{12}$/);
  });
});
