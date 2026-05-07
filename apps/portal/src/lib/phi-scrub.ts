const PHI_KEYS = new Set([
  'name',
  'birthDate',
  'telecom',
  'address',
  'identifier',
  'patient',
  'patientName',
]);

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /\+?\d[\d\s\-().]{6,}\d\b/g;

export function scrubPhi(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (typeof value === 'string') {
    return value.replace(EMAIL_RE, '<email>').replace(PHONE_RE, '<phone>');
  }
  if (Array.isArray(value)) return value.map((v) => scrubPhi(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = PHI_KEYS.has(k) ? '<redacted>' : scrubPhi(v, depth + 1);
    }
    return out;
  }
  return value;
}
