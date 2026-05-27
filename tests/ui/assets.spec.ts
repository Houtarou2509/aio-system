import { test, expect } from '@playwright/test';

async function loginAsAdmin(page) {
  await page.goto('/aio-system/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('you@institution.edu').fill('admin@aio-system.local');
  await page.getByPlaceholder('Enter password').fill('admin123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/aio-system\/?$/, { timeout: 10000 });
}

test.describe('Flow 3 — Assets page accessible to admin', () => {
  test('Admin can see Add Asset button and asset table', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');

    // Assets heading
    await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible({ timeout: 10000 });

    // Add Asset button (admin has assets:create permission)
    await expect(page.getByRole('button', { name: 'Add Asset' })).toBeVisible({ timeout: 5000 });

    // Asset table exists with seeded data
    await expect(page.getByRole('cell', { name: 'Dell Latitude 5540' })).toBeVisible({ timeout: 5000 });

    // Price column visible for admin
    await expect(page.getByRole('columnheader', { name: 'Price' })).toBeVisible();
  });
});

test.describe('Flow 4 — Asset detail opens via row click', () => {
  test('Click asset row → detail dialog opens', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');

    // Click Dell Latitude row
    const dellRow = page.locator('tr').filter({ hasText: 'Dell Latitude 5540' }).first();
    await dellRow.click();

    // Asset detail dialog opens
    await expect(page.getByRole('dialog', { name: 'Asset Details' })).toBeVisible({ timeout: 5000 });

    // Tabs visible
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Financials' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Audit' })).toBeVisible();

    // Serial Number visible for admin
    await expect(page.getByText('Serial Number')).toBeVisible();
    // Purchase Price visible for admin
    await expect(page.getByText('Purchase Price')).toBeVisible();
  });
});