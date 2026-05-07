import 'server-only';

/**
 * In-memory login-attempt tracker. Local to one Next.js process — adequate
 * for single-instance MVP deployments and CI. Production multi-instance
 * deployments must replace this with a Redis or DB-backed store (see
 * `PROD_LAUNCH.md` Phase 1.5 and Phase 3.x for the upgrade plan).
 *
 * Policy:
 *   - 5 failed attempts within `WINDOW_MS` lock the account for `LOCK_MS`.
 *   - Successful login clears the counter.
 *   - The lock is per-email; we don't lock per-IP because the home/wifi
 *     scenario for clinic staff makes IP locking too coarse.
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 min
const LOCK_MS = 30 * 60 * 1000; // 30 min auto-unlock
export const MAX_FAILS = 5;

interface Bucket {
  fails: number[]; // epoch-ms timestamps of recent failures
  lockedUntil?: number;
}

const buckets = new Map<string, Bucket>();

function key(email: string): string {
  return email.trim().toLowerCase();
}

function prune(b: Bucket, now: number): void {
  b.fails = b.fails.filter((t) => now - t < WINDOW_MS);
  if (b.lockedUntil && b.lockedUntil <= now) delete b.lockedUntil;
}

export interface LockoutStatus {
  locked: boolean;
  remainingMs?: number;
  failCount: number;
}

export function lockoutStatus(email: string, now = Date.now()): LockoutStatus {
  const k = key(email);
  const b = buckets.get(k);
  if (!b) return { locked: false, failCount: 0 };
  prune(b, now);
  if (b.lockedUntil && b.lockedUntil > now) {
    return { locked: true, remainingMs: b.lockedUntil - now, failCount: b.fails.length };
  }
  return { locked: false, failCount: b.fails.length };
}

/** Record a failed login. Returns the resulting status (locked or not). */
export function recordFailure(email: string, now = Date.now()): LockoutStatus {
  const k = key(email);
  let b = buckets.get(k);
  if (!b) {
    b = { fails: [] };
    buckets.set(k, b);
  }
  prune(b, now);
  b.fails.push(now);
  if (b.fails.length >= MAX_FAILS) {
    b.lockedUntil = now + LOCK_MS;
  }
  return lockoutStatus(email, now);
}

/** Successful auth — clear the counter. */
export function recordSuccess(email: string): void {
  buckets.delete(key(email));
}

/** Test helper — reset all state. */
export function _resetLockoutState(): void {
  buckets.clear();
}
