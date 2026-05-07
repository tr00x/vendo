import { describe, expect, it, vi, afterEach } from 'vitest';

/**
 * Production CSP guarantees. Next.js dev mode needs `unsafe-eval` for HMR
 * source maps; production must not. This test reloads next.config.mjs under
 * NODE_ENV=production and asserts the resolved CSP header is strict.
 */
describe('next.config.mjs — production CSP', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadConfigWith(nodeEnv: string) {
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.resetModules();
    // Use a static import path so vitest doesn't bail on dynamic-import
    // analysis. resetModules() above ensures a fresh evaluation that
    // re-reads process.env.NODE_ENV.
    const mod = await import('../../next.config.mjs');
    const headerSets = await mod.default.headers();
    return headerSets[0].headers.find(
      (h: { key: string; value: string }) => h.key === 'Content-Security-Policy',
    ) as { key: string; value: string };
  }

  it('does not include unsafe-eval in production', async () => {
    const cspHeader = await loadConfigWith('production');
    expect(cspHeader, 'CSP header must be set').toBeTruthy();
    expect(cspHeader.value).not.toContain('unsafe-eval');
  });

  it('still pins frame-ancestors and base-uri in production', async () => {
    const cspHeader = await loadConfigWith('production');
    expect(cspHeader.value).toContain("frame-ancestors 'none'");
    expect(cspHeader.value).toContain("base-uri 'self'");
  });
});
