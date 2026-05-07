/**
 * PHI-safe structured logger. ESLint forbids raw console.log outside this file.
 * In production, redaction is handled by transport (Pino + redact paths). For
 * dev we just emit JSON to stderr.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

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

function redact(value: unknown, depth = 0): unknown {
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

function emit(level: Level, msg: string, ctx?: Record<string, unknown>): void {
  const payload = { level, msg, ts: new Date().toISOString(), ...(ctx ? { ctx: redact(ctx) } : {}) };
  console.warn(JSON.stringify(payload));
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
};

export { redact as _redactForTest };
