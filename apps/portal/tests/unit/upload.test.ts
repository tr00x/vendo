import { describe, expect, it } from 'vitest';
import { magicMatches, sanitizeFilename } from '../../src/app/api/upload/validation';

describe('magicMatches', () => {
  it('accepts a real PDF header', () => {
    const buf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(magicMatches(buf, 'application/pdf')).toBe(true);
  });

  it('accepts a real PNG header', () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(magicMatches(buf, 'image/png')).toBe(true);
  });

  it('accepts a real JPEG header', () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(magicMatches(buf, 'image/jpeg')).toBe(true);
  });

  it('rejects forged Content-Type when bytes do not match', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(magicMatches(png, 'application/pdf')).toBe(false);
  });

  it('rejects payload too short to match', () => {
    expect(magicMatches(new Uint8Array([0x25]), 'application/pdf')).toBe(false);
  });

  it('rejects unknown MIME', () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(magicMatches(buf, 'application/x-msdownload')).toBe(false);
  });
});

describe('sanitizeFilename', () => {
  it('keeps a normal pdf filename intact', () => {
    expect(sanitizeFilename('referral-letter.pdf', 'application/pdf')).toBe('referral-letter.pdf');
  });

  it('strips path traversal', () => {
    expect(sanitizeFilename('../../etc/passwd.pdf', 'application/pdf')).toBe('passwd.pdf');
  });

  it('rejects NUL byte smuggling', () => {
    expect(sanitizeFilename('safe\x00.pdf', 'application/pdf')).toBeNull();
  });

  it('rejects empty / dot-only names', () => {
    expect(sanitizeFilename('', 'application/pdf')).toBeNull();
    expect(sanitizeFilename('.', 'application/pdf')).toBeNull();
    expect(sanitizeFilename('..', 'application/pdf')).toBeNull();
  });

  it('forces extension to match validated MIME', () => {
    expect(sanitizeFilename('evil.pdf.exe', 'application/pdf')).toBe('evil.pdf.pdf');
    expect(sanitizeFilename('photo.gif', 'image/png')).toBe('photo.png');
  });

  it('replaces unsafe filesystem characters', () => {
    expect(sanitizeFilename('a<b>c|d?e*.pdf', 'application/pdf')).toBe('a_b_c_d_e_.pdf');
  });

  it('truncates very long names', () => {
    const long = `${'x'.repeat(500)}.pdf`;
    const result = sanitizeFilename(long, 'application/pdf')!;
    expect(result.length).toBeLessThanOrEqual(204); // 200 + .pdf if forced
  });

  it('accepts both jpg and jpeg for image/jpeg', () => {
    expect(sanitizeFilename('scan.jpg', 'image/jpeg')).toBe('scan.jpg');
    expect(sanitizeFilename('scan.jpeg', 'image/jpeg')).toBe('scan.jpeg');
  });

  it('appends extension if none provided', () => {
    expect(sanitizeFilename('referral', 'application/pdf')).toBe('referral.pdf');
  });
});
