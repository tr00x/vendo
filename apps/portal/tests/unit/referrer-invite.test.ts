import { describe, expect, it } from 'vitest';
import { InviteReferrerSchema } from '@/components/clinic/referrer-types';

describe('InviteReferrerSchema', () => {
  const base = {
    firstName: 'Sarah',
    lastName: 'Smith',
    email: 'S.Smith@Example.com',
    password: 'StrongPass123!',
  };

  it('accepts a minimal valid payload and lower-cases the email', () => {
    const r = InviteReferrerSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('s.smith@example.com');
      expect(r.data.firstName).toBe('Sarah');
      expect(r.data.phone).toBeUndefined();
      expect(r.data.practice).toBeUndefined();
    }
  });

  it('trims whitespace on names', () => {
    const r = InviteReferrerSchema.safeParse({
      ...base,
      firstName: '  Sarah  ',
      lastName: '\tSmith\n',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.firstName).toBe('Sarah');
      expect(r.data.lastName).toBe('Smith');
    }
  });

  it('rejects an empty first name', () => {
    const r = InviteReferrerSchema.safeParse({ ...base, firstName: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/required/i);
    }
  });

  it('rejects an invalid email', () => {
    const r = InviteReferrerSchema.safeParse({ ...base, email: 'not-an-email' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/valid email/i);
    }
  });

  it('rejects names exceeding 80 chars', () => {
    const r = InviteReferrerSchema.safeParse({ ...base, firstName: 'A'.repeat(81) });
    expect(r.success).toBe(false);
  });

  it('coerces empty optional fields to undefined', () => {
    const r = InviteReferrerSchema.safeParse({ ...base, phone: '', practice: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBeUndefined();
      expect(r.data.practice).toBeUndefined();
    }
  });

  it('rejects passwords shorter than 12 chars', () => {
    const r = InviteReferrerSchema.safeParse({ ...base, password: 'short' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/12 characters/i);
    }
  });

  it('preserves provided phone and practice values', () => {
    const r = InviteReferrerSchema.safeParse({
      ...base,
      phone: '555-010-0142',
      practice: 'Springfield Family Practice',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBe('555-010-0142');
      expect(r.data.practice).toBe('Springfield Family Practice');
    }
  });
});
