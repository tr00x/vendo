import { describe, it, expect } from 'vitest';
import { _redactForTest } from '@/lib/log';

describe('log redaction', () => {
  it('redacts top-level PHI keys', () => {
    const out = _redactForTest({
      name: [{ given: ['Alice'], family: 'Smith' }],
      birthDate: '1990-01-01',
      email: 'a@b.com',
    });
    expect(out).toEqual({
      name: '<redacted>',
      birthDate: '<redacted>',
      email: 'a@b.com',
    });
  });

  it('redacts nested PHI keys', () => {
    const out = _redactForTest({
      patient: {
        name: [{ family: 'Smith' }],
        identifier: [{ value: '123' }],
      },
    });
    expect(out).toMatchObject({
      patient: { name: '<redacted>', identifier: '<redacted>' },
    });
  });

  it('redacts secrets', () => {
    const out = _redactForTest({ accessToken: 'sk-1', refreshToken: 'rt-1', password: 'p' });
    expect(out).toEqual({
      accessToken: '<redacted>',
      refreshToken: '<redacted>',
      password: '<redacted>',
    });
  });

  it('preserves non-PHI primitives', () => {
    expect(_redactForTest({ requestId: 'r-1', count: 42 })).toEqual({
      requestId: 'r-1',
      count: 42,
    });
  });
});
