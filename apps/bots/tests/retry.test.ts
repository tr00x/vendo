import { describe, it, expect, vi } from 'vitest';
import { withRetry, isTransient } from '../src/lib/retry.js';

describe('isTransient', () => {
  it('treats 5xx as transient', () => {
    expect(isTransient({ status: 500 })).toBe(true);
    expect(isTransient({ status: 503 })).toBe(true);
  });
  it('treats 4xx as non-transient', () => {
    expect(isTransient({ status: 400 })).toBe(false);
    expect(isTransient({ status: 404 })).toBe(false);
  });
  it('treats network errors as transient', () => {
    expect(isTransient({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isTransient({ code: 'ECONNRESET' })).toBe(true);
  });
});

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const fn = vi.fn(async () => 'ok');
    const out = await withRetry(fn);
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and eventually succeeds', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n < 3) throw { status: 500 };
      return 'ok';
    });
    const out = await withRetry(fn, { retries: 3, backoff: [0, 0, 0], retryOn: isTransient }, async () => {});
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry 4xx', async () => {
    const fn = vi.fn(async () => {
      throw { status: 400 };
    });
    await expect(
      withRetry(fn, { retries: 3, backoff: [0, 0, 0], retryOn: isTransient }, async () => {}),
    ).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after retries exhausted', async () => {
    const fn = vi.fn(async () => {
      throw { status: 500 };
    });
    await expect(
      withRetry(fn, { retries: 2, backoff: [0, 0], retryOn: isTransient }, async () => {}),
    ).rejects.toMatchObject({ status: 500 });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
