import { log } from '@/lib/log';

// Phase 3.4 — externally-pollable health endpoint. Each dependency is
// probed in parallel with a strict per-check timeout so a slow Medplum
// can't ride past the UptimeRobot 60s budget. Returns 200 only when every
// upstream check succeeds; degraded → 503 with a per-check breakdown so
// on-call can see which dependency is down without grepping logs.
export const dynamic = 'force-dynamic';

const CHECK_TIMEOUT_MS = 4000;

type CheckStatus = 'ok' | 'fail' | 'skipped';
interface Check {
  name: string;
  status: CheckStatus;
  latencyMs: number;
  error?: string;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function timed(name: string, fn: () => Promise<void>): Promise<Check> {
  const t0 = Date.now();
  try {
    await withTimeout(fn(), CHECK_TIMEOUT_MS, name);
    return { name, status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      name,
      status: 'fail',
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkMedplum(): Promise<Check> {
  return timed('medplum', async () => {
    const url = process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL;
    if (!url) throw new Error('NEXT_PUBLIC_MEDPLUM_BASE_URL not set');
    const res = await fetch(`${url.replace(/\/$/, '')}/healthcheck`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  });
}

async function checkRedis(): Promise<Check> {
  // Redis is only required for multi-instance lockout (Phase 1.5). When
  // REDIS_URL is unset (single-instance dev/staging), don't fail health —
  // mark skipped so on-call can see it's intentional, not silent.
  const url = process.env.REDIS_URL;
  if (!url) {
    return { name: 'redis', status: 'skipped', latencyMs: 0 };
  }
  return timed('redis', async () => {
    // Native fetch doesn't speak Redis. We don't pull ioredis just for a
    // health probe; open a minimal TCP socket via node:net and send PING.
    const { createConnection } = await import('node:net');
    const u = new URL(url);
    await new Promise<void>((resolve, reject) => {
      const sock = createConnection(
        { host: u.hostname, port: Number(u.port || 6379) },
        () => {
          sock.write('*1\r\n$4\r\nPING\r\n');
        },
      );
      sock.setTimeout(CHECK_TIMEOUT_MS, () => {
        sock.destroy(new Error('redis ping timeout'));
      });
      sock.on('data', (buf) => {
        sock.end();
        if (buf.toString().startsWith('+PONG')) resolve();
        else reject(new Error(`unexpected redis reply: ${buf.toString().slice(0, 16)}`));
      });
      sock.on('error', reject);
    });
  });
}

async function checkDatabase(): Promise<Check> {
  // DB is reached through Medplum in this stack — there's no direct PG
  // connection from the portal. The Medplum check above implicitly covers
  // DB liveness (Medplum's /healthcheck pings PG). We surface this as a
  // separate skipped check so the response shape is stable for ops tooling
  // even if/when a direct pool is introduced later.
  return { name: 'database', status: 'skipped', latencyMs: 0 };
}

export async function GET(req: Request): Promise<Response> {
  const t0 = Date.now();
  const checks = await Promise.all([checkMedplum(), checkRedis(), checkDatabase()]);
  const failed = checks.filter((c) => c.status === 'fail');
  const overall = failed.length === 0 ? 'ok' : 'degraded';
  const status = failed.length === 0 ? 200 : 503;

  // HIPAA info-disclosure hardening: the per-check breakdown reveals
  // upstream stack topology (Medplum URL, Redis presence, Postgres-via-
  // Medplum), which is useful for ops but a recon gift for attackers.
  // When HEALTH_TOKEN is configured, require it for the detailed view;
  // unauthenticated callers get a bare ok/degraded probe with no
  // dependency names or error strings. UptimeRobot can poll the bare
  // version; on-call dashboards pass the token for the full payload.
  const expected = process.env.HEALTH_TOKEN;
  const provided = req.headers.get('x-health-token');
  const authorized = !expected || provided === expected;

  if (failed.length > 0) {
    log.warn('health_degraded', { failed: failed.map((c) => c.name) });
  }

  if (!authorized) {
    return Response.json({ status: overall, ts: Date.now() }, { status });
  }

  return Response.json(
    {
      status: overall,
      service: 'vendo-portal',
      ts: Date.now(),
      elapsedMs: Date.now() - t0,
      checks,
    },
    { status },
  );
}
