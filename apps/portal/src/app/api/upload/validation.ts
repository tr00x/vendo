export const MAX_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ALLOWED_EXT_BY_MIME: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
};

/** Confirm first bytes match the claimed MIME — defense-in-depth against
 *  a forged Content-Type header. */
export function magicMatches(buf: Uint8Array, mime: string): boolean {
  if (buf.length < 4) return false;
  if (mime === 'application/pdf') {
    return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  }
  if (mime === 'image/png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mime === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  return false;
}

/**
 * Strip directory traversal, control chars, and double extensions.
 * Returns a safe basename or `null` if nothing usable remains.
 */
export function sanitizeFilename(raw: string, mime: string): string | null {
  const stripped = raw.replace(/[\\/]/g, '/').split('/').pop()?.trim() ?? '';
  // eslint-disable-next-line no-control-regex
  if (!stripped || /[\x00-\x1f]/.test(stripped)) return null;
  const cleaned = stripped.replace(/[<>:"|?*]/g, '_').replace(/\s+/g, ' ').slice(0, 200);
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;

  const ext = cleaned.includes('.') ? cleaned.split('.').pop()!.toLowerCase() : '';
  const allowed = ALLOWED_EXT_BY_MIME[mime] ?? [];
  if (allowed.includes(ext)) return cleaned;
  const base = cleaned.includes('.') ? cleaned.slice(0, cleaned.lastIndexOf('.')) : cleaned;
  return `${base}.${allowed[0] ?? 'bin'}`;
}
