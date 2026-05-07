import { test, expect } from '@playwright/test';

/**
 * E2E happy path. Requires the Compose stack + seed + a test referrer with a
 * known password (the demo accounts seeded by @vendo/seed all share
 * `ClinicPass!2026`).
 */
test('referrer sees password sign-in form with working validation', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email address').fill('not-an-email');
  await page.getByLabel('Password').fill('whatever');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page.getByRole('alert').first()).toContainText(/valid email|accept/i);
});
