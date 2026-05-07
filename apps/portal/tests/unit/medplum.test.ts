import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('getBrowserMedplumClient', () => {
  beforeEach(() => vi.resetModules());

  it('returns a configured client with the env baseUrl', async () => {
    const { getBrowserMedplumClient } = await import('@/lib/medplum');
    const client = getBrowserMedplumClient();
    expect(client.getBaseUrl()).toBe(process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL);
  });

  it('returns the same instance on subsequent calls (singleton)', async () => {
    const mod = await import('@/lib/medplum');
    expect(mod.getBrowserMedplumClient()).toBe(mod.getBrowserMedplumClient());
  });

  it('getServerMedplumClient creates fresh instances each call', async () => {
    const mod = await import('@/lib/medplum');
    expect(mod.getServerMedplumClient()).not.toBe(mod.getServerMedplumClient());
  });
});
