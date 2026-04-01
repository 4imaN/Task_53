import { expect, test, type Page } from '@playwright/test';
import { installMockApi } from './support/mock-api';

type LoginActor = 'administrator' | 'manager' | 'moderator' | 'catalog-editor' | 'warehouse-clerk';

async function login(page: Page, actor: LoginActor, username = 'operator.local') {
  const expectedHome: Record<LoginActor, RegExp> = {
    administrator: /\/workspace\/administrator$/,
    manager: /\/workspace\/manager$/,
    moderator: /\/workspace\/moderator$/,
    'catalog-editor': /\/workspace\/catalog-editor$/,
    'warehouse-clerk': /\/workspace\/warehouse-clerk$/
  };

  await page.goto(`/login/${actor}`);
  await page.getByPlaceholder('Enter username').fill(username);
  await page.getByPlaceholder('Enter password').fill('operator-entry');
  await page.getByRole('button', { name: /enter workspace/i }).click();
  await page.waitForURL(expectedHome[actor]);
}

test('auth guard redirects unauthenticated direct access to actor-specific login', async ({ page }) => {
  await installMockApi(page);
  await page.goto('/inventory');
  await expect(page).toHaveURL(/\/login\/warehouse-clerk$/);
});

test('plain /login route redirects to actor-specific login and does not show selector cards', async ({ page }) => {
  await installMockApi(page);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/login\/warehouse-clerk$/);
  await expect(page.getByRole('heading', { name: /warehouse clerk access/i })).toBeVisible();
  await expect(page.getByText(/choose your workspace/i)).toHaveCount(0);
});

test('role guard redirects unauthorized direct access to the user home workspace', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'warehouse-clerk');
  await page.goto('/warehouse');
  await expect(page).toHaveURL(/\/workspace\/warehouse-clerk$/);
});

test('login failure feedback is visible on the actor login page', async ({ page }) => {
  await installMockApi(page, { loginFails: true });
  await page.goto('/login/warehouse-clerk');
  await page.getByPlaceholder('Enter username').fill('denied.user');
  await page.getByPlaceholder('Enter password').fill('denied-entry');
  await page.getByRole('button', { name: /enter workspace/i }).click();
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login\/warehouse-clerk$/);
  await expect(page.getByPlaceholder('Enter username')).toHaveValue('denied.user');
});

test('login page surfaces login-hints failure and keeps the form usable', async ({ page }) => {
  await installMockApi(page, { loginHintsFails: true });
  await page.goto('/login/warehouse-clerk');
  await page.getByPlaceholder('Enter username').fill('operator.local');
  await page.getByPlaceholder('Enter password').fill('operator-entry');
  await page.getByPlaceholder('Enter username').blur();
  await expect(page.getByText(/login precheck failed/i)).toBeVisible();
  await page.getByRole('button', { name: /enter workspace/i }).click();
  await expect(page.getByText(/login precheck failed/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login\/warehouse-clerk$/);
  await expect(page.getByPlaceholder('Enter username')).toHaveValue('operator.local');
  await expect(page.getByPlaceholder('Enter password')).toHaveValue('operator-entry');
  await expect(page.getByRole('button', { name: /enter workspace/i })).toBeEnabled();
});

test('login page surfaces captcha load failure and keeps the form usable', async ({ page }) => {
  await installMockApi(page, { captchaFails: true });
  await page.goto('/login/warehouse-clerk');
  await page.getByPlaceholder('Enter username').fill('operator.local');
  await page.getByPlaceholder('Enter password').fill('operator-entry');
  await page.getByPlaceholder('Enter username').blur();
  await expect(page.getByText(/captcha load failed/i)).toBeVisible();
  await expect(page.getByPlaceholder('Enter challenge text')).toBeVisible();
  await page.getByRole('button', { name: /enter workspace/i }).click();
  await expect(page.getByText(/captcha load failed/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login\/warehouse-clerk$/);
  await expect(page.getByPlaceholder('Enter password')).toHaveValue('operator-entry');
});

test('search workspace supports filters, time range, sorting, pagination, and saved views', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'warehouse-clerk');
  await page.goto('/search');
  await expect(page.getByRole('heading', { name: /saved views, combined filters, and sortable results/i })).toBeVisible();

  const searchPanel = page.locator('.search-filter-panel');
  await searchPanel.getByPlaceholder('Item or barcode').fill('inventory item');
  await searchPanel.getByPlaceholder('Lot').fill('LOT-1');
  await searchPanel.getByPlaceholder('Warehouse id').fill('wh-1');
  await searchPanel.getByPlaceholder('Document status').fill('approved');
  await searchPanel.locator('input[type="date"]').nth(0).fill('2026-01-01');
  await searchPanel.locator('input[type="date"]').nth(1).fill('2026-09-30');
  await searchPanel.getByRole('combobox').selectOption({ label: '10 / page' });
  await searchPanel.getByRole('button', { name: /^search$/i }).click();

  await expect(page.getByText(/loaded 1-\d+ of \d+/i)).toBeVisible();

  await page.getByRole('button', { name: /updated/i }).click({ force: true });
  await expect(page.getByRole('button', { name: /updated/i })).toContainText('↑');

  await page.getByPlaceholder('Saved view name').fill('Ops focus');
  await page.getByRole('button', { name: /save current view/i }).click();
  await expect(page.getByText(/saved view "Ops focus"/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ops focus' })).toBeVisible();

  await searchPanel.getByPlaceholder('Lot').fill('');
  await searchPanel.getByPlaceholder('Warehouse id').fill('');
  await searchPanel.getByPlaceholder('Document status').fill('');
  await searchPanel.locator('input[type="date"]').nth(0).fill('');
  await searchPanel.locator('input[type="date"]').nth(1).fill('');
  await searchPanel.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByText(/page 1 of/i)).toBeVisible();
  const nextButton = page.getByRole('button', { name: /^next$/i });
  await expect(nextButton).toBeEnabled();
  await nextButton.click({ force: true });
  await expect(page.locator('.search-pagination-status strong')).toHaveText('Page 2', { timeout: 10000 });
  await expect(page.getByText(/loaded 11-20 of 35/i)).toBeVisible();
});

test('topbar command search filters suggestions, routes to command targets, and submits record searches', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'warehouse-clerk');

  const commandInput = page.getByTestId('topbar-command-input');
  await commandInput.fill('inventory');
  await expect(page.getByTestId('topbar-suggestion--inventory')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/inventory$/);

  await commandInput.fill('Inventory Item 01');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search\?item=Inventory%20Item%2001$/);
  await expect(page.locator('.search-filter-panel').getByPlaceholder('Item or barcode')).toHaveValue('Inventory Item 01');
  await expect(page.getByText(/loaded 1-1 of 1/i)).toBeVisible();
});

test('topbar quick links show a hover state that reads like an interactive control', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium' || test.info().project.name.includes('mobile'), 'computed hover style check is desktop chromium-only');
  await installMockApi(page);
  await login(page, 'warehouse-clerk');

  const quickLink = page.getByTestId('topbar-link-inventory');
  const before = await quickLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transform: style.transform,
      boxShadow: style.boxShadow
    };
  });

  await quickLink.hover();

  const after = await quickLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transform: style.transform,
      boxShadow: style.boxShadow
    };
  });

  expect(after.transform).not.toBe(before.transform);
  expect(after.boxShadow).not.toBe('none');
});

test('search workspace surfaces recoverable error state', async ({ page }) => {
  await installMockApi(page, { searchFails: true });
  await login(page, 'warehouse-clerk');
  await page.goto('/search');
  await page.locator('.search-filter-panel').getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByText(/search backend unavailable/i)).toBeVisible();
});

test('search workspace exposes loading and empty states', async ({ page }) => {
  await installMockApi(page, { searchDelayMs: 400 });
  await login(page, 'warehouse-clerk');
  await page.goto('/search');
  const searchPanel = page.locator('.search-filter-panel');
  await searchPanel.getByPlaceholder('Item or barcode').fill('nonexistent-item');
  await searchPanel.getByRole('button', { name: /^search$/i }).click();
  await expect(page.getByText(/refreshing the result set with the current filters/i)).toBeVisible();
  await expect(page.locator('.search-results .search-empty-state')).toContainText('No rows returned for the current filter set.');
});

test('inventory supports keyboard lookup and pick execution', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'warehouse-clerk');
  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: /scan, validate, and execute inventory actions inline/i })).toBeVisible();
  await page.getByPlaceholder('barcode, lot, or SKU').fill('BC-00001');
  await page.getByRole('button', { name: /lookup/i }).click();
  await expect(page.getByText(/matched storage tote in central warehouse/i)).toBeVisible();
  await page.getByRole('button', { name: /^pick$/i }).click();
  await expect(page.getByText(/pick completed/i)).toBeVisible();
});

test('inventory camera path shows unsupported-browser fallback cleanly', async ({ page }) => {
  await installMockApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'BarcodeDetector', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
  await login(page, 'warehouse-clerk');
  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: /scan, validate, and execute inventory actions inline/i })).toBeVisible();
  await page.getByRole('button', { name: /use camera/i }).click();
  await expect(page.getByText(/does not expose barcode detection or camera apis/i)).toBeVisible();
});

test('inventory camera path supports cancel after activation', async ({ page }) => {
  await installMockApi(page);
  test.skip(test.info().project.name.includes('mobile'), 'camera cancel coverage is desktop-only');
  await page.addInitScript(() => {
    class MockBarcodeDetector {
      async detect() {
        return [];
      }
    }

    Object.defineProperty(globalThis, 'BarcodeDetector', { value: MockBarcodeDetector, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia() {
          return new MediaStream();
        }
      }
    });
  });
  await login(page, 'warehouse-clerk');
  await page.goto('/inventory');
  await page.getByRole('button', { name: /use camera/i }).click();
  await expect(page.getByText(/align the barcode inside the camera frame/i)).toBeVisible();
  await page.getByRole('button', { name: /stop camera/i }).click();
  await expect(page.getByText(/camera scanning was cancelled/i)).toBeVisible();
});

test('bulk workflow surfaces pre-check failure cleanly', async ({ page }) => {
  await installMockApi(page, { precheckFails: true });
  await login(page, 'manager');
  await page.goto('/bulk');

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'catalog-items.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('sku,name\nSKU-001,Storage Tote\n')
  });
  await page.getByRole('button', { name: /run pre-check/i }).click();
  await expect(page.getByText(/duplicate barcode detected/i)).toBeVisible();
});

test('bulk workflow supports import success and permission-sensitive export failure', async ({ page }) => {
  await installMockApi(page, { exportFails: true });
  await login(page, 'manager');
  await page.goto('/bulk');
  await expect(page.getByRole('heading', { name: /csv\/xlsx template, pre-check validation, guided import, and export delivery/i })).toBeVisible();
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'catalog-items.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('sku,name\nSKU-001,Storage Tote\n')
  });
  await page.getByRole('button', { name: /run pre-check/i }).click();
  await expect(page.getByText(/ready to import/i)).toBeVisible();
  await page.getByRole('button', { name: /confirm import/i }).click();
  await expect(page.getByText(/import completed and stored/i)).toBeVisible();
  await page.getByRole('button', { name: /export catalog data/i }).click();
  await expect(page.getByText(/export is not allowed for this role/i)).toBeVisible();
});

test('bulk export prevents duplicate submissions while the request is in flight', async ({ page }) => {
  await installMockApi(page, { exportDelayMs: 600 });
  await login(page, 'manager');
  await page.goto('/bulk');
  const exportButton = page.getByRole('button', { name: /export catalog data/i });
  await exportButton.click();
  await expect(page.getByRole('button', { name: /exporting/i })).toBeDisabled();
});

test('warehouse setup flow supports create warehouse, zone, and bin from the UI', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'manager');
  await page.goto('/warehouse');
  await page.getByPlaceholder('WH-03').fill('WH-3');
  await page.getByPlaceholder('New warehouse name').fill('North Annex');
  await page.getByPlaceholder('Address').fill('99 North St');
  await page.getByRole('button', { name: /create warehouse/i }).click();
  await expect(page.getByText(/warehouse created/i)).toBeVisible();

  await page.getByPlaceholder('RECV').fill('BULK');
  await page.getByPlaceholder('Receiving').fill('Bulk Storage');
  await page.getByRole('button', { name: /create zone/i }).click();
  await expect(page.getByText(/zone created/i)).toBeVisible();

  await page.getByPlaceholder('PICK-02').fill('BIN-X1');
  await page.getByRole('button', { name: /create bin/i }).click();
  await expect(page.getByText(/bin created/i)).toBeVisible();
});

test('admin access-control flow supports user creation and scope assignment', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'administrator');
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: /create users, assign roles, and control warehouse or department scope/i })).toBeVisible();
  await page.getByRole('button', { name: /new user/i }).click();
  await page.getByPlaceholder('local.username').fill('new.operator');
  await page.getByPlaceholder('Operator name').fill('New Operator');
  await page.getByPlaceholder('Required').fill('operator-entry');
  await page.locator('.checkbox-card', { hasText: 'Warehouse Clerk' }).locator('input[type="checkbox"]').check();
  await page.locator('.checkbox-card', { hasText: 'Central Warehouse' }).locator('input[type="checkbox"]').check();
  await page.locator('.checkbox-card', { hasText: 'District Ops' }).locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: /create user/i }).click();
  await expect(page.getByText(/user created/i)).toBeVisible();
});

test('catalog flow supports review, question, answer, and abuse reporting', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'catalog-editor');
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: /ratings, reviews, q&a, favorites, and abuse reporting/i })).toBeVisible();

  await page.getByPlaceholder('Item name').fill('Storage Tote Plus');
  await page.getByRole('button', { name: /save item details/i }).click();
  await expect(page.getByText(/item details updated/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Storage Tote Plus' })).toBeVisible();

  await page.getByPlaceholder('Share warehouse or catalog feedback').fill('Catalog review from the browser suite.');
  await page.getByRole('button', { name: /save review/i }).click();
  await expect(page.getByText(/review saved/i)).toBeVisible();
  await expect(page.getByText(/Catalog review from the browser suite\./i)).toBeVisible();

  await page.getByPlaceholder('Ask a question about this item').fill('Can this tote support extra classroom labels?');
  await page.getByRole('button', { name: /^ask$/i }).click();
  await expect(page.getByText(/question submitted/i)).toBeVisible();
  await expect(page.getByText(/Can this tote support extra classroom labels\?/i)).toBeVisible();

  await page.getByPlaceholder('Add an answer').first().fill('Yes. The front panel fits district shelf labels.');
  await page.getByRole('button', { name: /^answer$/i }).first().click();
  await expect(page.getByText(/answer submitted/i)).toBeVisible();
  await expect(page.getByText(/front panel fits district shelf labels/i)).toBeVisible();

  await page.getByPlaceholder('Report reason for this review').first().fill('Needs moderator review');
  await page.getByRole('button', { name: /report review/i }).first().click();
  await expect(page.getByText(/review report submitted to moderation/i)).toBeVisible();
});

test('moderation flow supports queue updates and reporter-safe status changes', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'moderator');
  await page.goto('/moderation');
  await expect(page.getByRole('heading', { name: /review abuse reports and publish reporter-safe status updates/i })).toBeVisible();

  await page.getByPlaceholder('Moderator-only context for this action').fill('Checked the reported content and contacted catalog owner.');
  await page.getByRole('button', { name: /investigate/i }).click();
  await expect(page.getByText(/updated to under_review/i)).toBeVisible();
  await expect(page.locator('.moderation-card')).toContainText('under_review');

  await page.getByRole('button', { name: /resolve/i }).click();
  await expect(page.getByText(/updated to resolved/i)).toBeVisible();
  await expect(page.locator('.moderation-card')).toContainText('resolved');
});

test('documents flow supports creation and workflow transition', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'manager');
  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: /operational records with controlled state transitions/i })).toBeVisible();

  await page.getByPlaceholder('Optional document number').fill('REC-PLAY-9001');
  await page.getByPlaceholder('Reference or note').fill('Browser flow verification');
  await page.getByPlaceholder('Source supplier or dock').fill('Dock 7');
  await page.locator('.document-line-card select').first().selectOption('item-1');
  await page.getByPlaceholder('Lot code').fill('LOT-PLAY-1');
  await page.locator('.document-line-card select').nth(1).selectOption('bin-1');
  await page.getByRole('button', { name: /create document/i }).click();
  await expect(page.getByText(/created rec-play-9001/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'REC-PLAY-9001' })).toBeVisible();

  const createdRow = page.getByRole('row').filter({ hasText: 'REC-PLAY-9001' });
  await createdRow.getByRole('button', { name: /^submitted$/i }).dispatchEvent('click');
  await expect(createdRow).toContainText('submitted');
});

test('profile flow supports validation, password update, and session revoke', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'administrator');
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: /identity, password controls, access scope, and active sessions/i })).toBeVisible();

  await page.getByRole('button', { name: /update password/i }).click();
  await expect(page.getByText(/enter the current and new password/i)).toBeVisible();

  await page.getByPlaceholder('Current password').fill('operator-entry');
  await page.getByPlaceholder('New password').fill('OperatorNext!123');
  await page.getByRole('button', { name: /update password/i }).click();
  await expect(page.getByText(/password updated/i)).toBeVisible();

  await page.getByRole('button', { name: /^revoke$/i }).click();
  await expect(page.getByRole('button', { name: /^revoke$/i })).toHaveCount(0);
});

test('inbox flow supports marking one message read and then marking all read', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'warehouse-clerk');
  await page.goto('/inbox');
  await expect(page.getByRole('heading', { name: /reporter-safe case updates and local operational notifications/i })).toBeVisible();

  await page.getByRole('button', { name: /^mark read$/i }).first().click();
  await expect(page.getByText(/^read$/i).first()).toBeVisible();

  await page.getByRole('button', { name: /mark all read/i }).click();
  await expect(page.getByRole('button', { name: /^mark read$/i })).toHaveCount(0);
});

test('logout clears in-memory session state and blocks direct re-entry', async ({ page }) => {
  await installMockApi(page);
  await login(page, 'warehouse-clerk');
  if (test.info().project.name.includes('mobile')) {
    await page.getByRole('button', { name: /menu/i }).click();
  }
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login\/warehouse-clerk$/);
  await page.goto('/inventory');
  await expect(page).toHaveURL(/\/login\/warehouse-clerk$/);
});
