import { expect, test } from '@playwright/test';

const actor = process.env.OMNISTOCK_E2E_ACTOR;
const username = process.env.OMNISTOCK_E2E_USERNAME;
const password = process.env.OMNISTOCK_E2E_PASSWORD;

test.skip(!actor || !username || !password, 'Set OMNISTOCK_E2E_ACTOR, OMNISTOCK_E2E_USERNAME, and OMNISTOCK_E2E_PASSWORD to run the local real smoke.');

test('local real smoke logs in and loads a protected route against the real API', async ({ page }) => {
  const expectedHome: Record<string, RegExp> = {
    administrator: /\/workspace\/administrator$/,
    manager: /\/workspace\/manager$/,
    moderator: /\/workspace\/moderator$/,
    'catalog-editor': /\/workspace\/catalog-editor$/,
    'warehouse-clerk': /\/workspace\/warehouse-clerk$/
  };

  await page.goto(`/login/${actor}`);
  await page.getByPlaceholder('Enter username').fill(username!);
  await page.getByPlaceholder('Enter password').fill(password!);
  await page.getByRole('button', { name: /enter workspace/i }).click();
  await page.waitForURL(expectedHome[actor!] ?? /\/workspace\//);

  await page.goto('/search');
  await expect(page.getByRole('heading', { name: /saved views, combined filters, and sortable results/i })).toBeVisible();
  await expect(page.locator('.search-results .data-table tbody tr').first()).toBeVisible();
});
