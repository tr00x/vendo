import { test, expect } from '@playwright/test';

/**
 * UI-level mirror of the FHIR isolation gate in @vendo/seed. Runs against a
 * pre-seeded environment with two referrers (Alice, Bob) and one referral per
 * referrer. Asserts Alice cannot reach /refer/<bobs-id>.
 *
 * Requires env vars seeded by the CI job:
 * - E2E_ALICE_TOKEN — pre-issued access token cookie material
 * - E2E_BOB_REFERRAL_ID — Bob's ServiceRequest id
 */
test.skip(!process.env.E2E_ALICE_TOKEN || !process.env.E2E_BOB_REFERRAL_ID, 'requires CI fixtures');

test('Alice cannot view Bob\'s referral via UI', async ({ page, context }) => {
  await context.addCookies([
    {
      name: 'vendo.sid',
      value: process.env.E2E_ALICE_TOKEN ?? '',
      url: 'http://localhost:3000',
    },
  ]);
  const response = await page.goto(`/refer/${process.env.E2E_BOB_REFERRAL_ID}`);
  // Either 404 page or redirect to login — both acceptable. Never the data.
  await expect(page.locator('body')).not.toContainText("Bob");
  expect(response?.status()).not.toBe(200);
});
