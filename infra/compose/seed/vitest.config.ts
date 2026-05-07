import { defineConfig } from 'vitest/config';
import path from 'node:path';

const isIntegration = process.env.VITEST_INTEGRATION === '1';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required for seed integration tests (run: source .env)`);
  return v;
}

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/node-shims.ts'],
    include: isIntegration
      ? ['src/**/*.integration.test.ts']
      : ['src/**/*.test.ts'],
    exclude: isIntegration
      ? []
      : ['src/**/*.integration.test.ts', '**/node_modules/**', '**/dist/**'],
    env: isIntegration
      ? {
          MEDPLUM_BASE_URL: process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/',
          SEED_ADMIN_EMAIL: requireEnv('SEED_ADMIN_EMAIL'),
          SEED_ADMIN_PASSWORD: requireEnv('SEED_ADMIN_PASSWORD'),
        }
      : {
          MEDPLUM_BASE_URL: 'http://localhost:8103/',
          SEED_ADMIN_EMAIL: 'admin@vendo.local',
          SEED_ADMIN_PASSWORD: 'unit-test-placeholder',
        },
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@portal': path.resolve(__dirname, '../../../apps/portal/src'),
      // Bundle helpers in apps/portal/src import sibling modules via the
      // portal's TS path alias (`@/lib/...`). Vitest needs the same shortcut
      // resolved relative to the portal source root.
      '@': path.resolve(__dirname, '../../../apps/portal/src'),
    },
  },
});
