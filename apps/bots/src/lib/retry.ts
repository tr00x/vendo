export interface RetryOpts {
  retries: number;
  backoff: number[];
  retryOn: (err: unknown) => boolean;
}

export function isTransient(err: unknown): boolean {
  const e = err as { status?: number; code?: string; name?: string };
  if (typeof e?.status === 'number' && e.status >= 500) return true;
  if (e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' || e?.code === 'ENOTFOUND') return true;
  if (e?.name === 'TimeoutError') return true;
  return false;
}

export const DEFAULT_RETRY_OPTS: RetryOpts = {
  retries: 3,
  backoff: [1000, 4000, 16000],
  retryOn: isTransient,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = DEFAULT_RETRY_OPTS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.retries) break;
      if (!opts.retryOn(err)) break;
      const delay = opts.backoff[attempt] ?? opts.backoff[opts.backoff.length - 1] ?? 1000;
      await sleep(delay);
    }
  }
  throw lastErr;
}
