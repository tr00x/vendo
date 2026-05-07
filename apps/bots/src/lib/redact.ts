import { createHash } from 'node:crypto';

const REDACT_KEYS = new Set([
  'name',
  'birthDate',
  'telecom',
  'address',
  'identifier',
  'password',
  'accessToken',
  'refreshToken',
]);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k) ? '<redacted>' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
}

export function botLog(event: string, ctx: Record<string, unknown>): void {
  const payload = {
    event,
    ts: new Date().toISOString(),
    ...redact(ctx) as Record<string, unknown>,
  };
  console.warn(JSON.stringify(payload));
}
