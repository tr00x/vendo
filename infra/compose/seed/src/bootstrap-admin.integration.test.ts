import { describe, it, expect } from 'vitest';
import { bootstrapAdminAndProject } from './bootstrap-admin.js';

describe('bootstrapAdminAndProject', () => {
  it('creates project on first run and is idempotent', async () => {
    const first = await bootstrapAdminAndProject();
    expect(first.projectId).toMatch(/^[\w-]+$/);
    expect(first.adminEmail).toBe(process.env.SEED_ADMIN_EMAIL);

    const second = await bootstrapAdminAndProject();
    expect(second.projectId).toBe(first.projectId);
  });
});
