import { expect, test, type Page } from '@playwright/test';
import { createReceivingDocumentFixture } from './support/live-api';

type LoginActor = 'administrator' | 'manager' | 'moderator' | 'catalog-editor' | 'warehouse-clerk';

const actor = (process.env.OMNISTOCK_E2E_ACTOR ?? 'administrator') as LoginActor;
const username = process.env.OMNISTOCK_E2E_USERNAME;
const password = process.env.OMNISTOCK_E2E_PASSWORD;

test.skip(!username || !password, 'Set OMNISTOCK_E2E_USERNAME and OMNISTOCK_E2E_PASSWORD to run the local real smoke.');

async function login(page: Page) {
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
}

test('local real smoke logs in and loads real search results against the live API', async ({ page }) => {
  await login(page);

  await page.goto('/search');
  await expect(page.getByRole('heading', { name: /saved views, combined filters, and sortable results/i })).toBeVisible();
  await expect(page.locator('.search-results .data-table tbody tr').first()).toBeVisible();
});

test('local real smoke performs a real inventory receive action', async ({ page }) => {
  test.skip(actor !== 'administrator', 'Run the full local smoke with OMNISTOCK_E2E_ACTOR=administrator.');
  await login(page);

  await page.goto('/inventory');
  await page.getByPlaceholder('barcode, lot, or SKU').fill('123456789012');
  await page.getByRole('button', { name: /lookup/i }).click();
  await expect(page.getByText(/matched classroom paper towels in central district warehouse/i)).toBeVisible();

  await page.getByPlaceholder('New or existing lot code').fill(`SMOKE-INV-${Date.now()}`);
  await page.getByRole('button', { name: /^receive$/i }).click();
  await expect(page.getByText(/receive completed/i)).toBeVisible();
});

test('local real smoke transitions and executes a real receiving document', async ({ page, request }) => {
  test.skip(actor !== 'administrator', 'Run the full local smoke with OMNISTOCK_E2E_ACTOR=administrator.');
  const created = await createReceivingDocumentFixture(request, actor, username!, password!);

  await login(page);
  await page.goto('/documents');
  const documentRow = page.locator('tr', { hasText: created.documentNumber }).first();
  await expect(documentRow).toBeVisible();
  await documentRow.click();
  await documentRow.getByRole('button', { name: /^submitted$/i }).click();
  await expect(page.getByText(/document moved to submitted/i)).toBeVisible();

  await page.locator('tr', { hasText: created.documentNumber }).first().getByRole('button', { name: /^approved$/i }).click();
  await expect(page.getByText(/document moved to approved/i)).toBeVisible();

  await page.locator('tr', { hasText: created.documentNumber }).first().click();
  await page.getByRole('button', { name: /execute receiving/i }).click();
  await expect(page.getByText(/receiving execution completed for 1 lot line/i)).toBeVisible();
});

test('local real smoke updates moderation status and surfaces the reporter-safe inbox notification', async ({ page }) => {
  test.skip(actor !== 'administrator', 'Run the full local smoke with OMNISTOCK_E2E_ACTOR=administrator.');
  await login(page);

  await page.goto('/moderation');
  await expect(page.locator('.moderation-card')).toBeVisible();
  await page.locator('.moderation-card').getByRole('button', { name: /resolve/i }).click();
  await expect(page.getByText(/updated to resolved/i)).toBeVisible();

  await page.goto('/inbox');
  await expect(page.getByText(/report resolved/i)).toBeVisible();
});
