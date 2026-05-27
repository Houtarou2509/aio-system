import { test, expect } from '@playwright/test';

async function loginAsAdmin(page) {
  await page.goto('/aio-system/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('you@institution.edu').fill('admin@aio-system.local');
  await page.getByPlaceholder('Enter password').fill('admin123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/aio-system\/?$/, { timeout: 10000 });
}

async function loginAsGuest(page) {
  await page.goto('/aio-system/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('you@institution.edu').fill('guest1@aio-system.local');
  await page.getByPlaceholder('Enter password').fill('admin123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/aio-system\/?$/, { timeout: 10000 });
}

test.describe('Flow 5 — Role-gated UI (Guest user)', () => {
  test('Guest cannot see Add Asset, Price column, Serial Number, Purchase Details', async ({ page }) => {
    await loginAsGuest(page);

    // Navigate to assets page
    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');

    // "Add Asset" button should NOT be visible
    await expect(page.getByRole('button', { name: 'Add Asset' })).not.toBeVisible();

    // Price column header should NOT be visible for Guest
    await expect(page.getByRole('columnheader', { name: 'Price' })).not.toBeVisible();

    // "↑ Import" button should NOT be visible for Guest
    await expect(page.getByRole('button', { name: /Import/ })).not.toBeVisible();

    // GUEST role badge in sidebar
    const sidebar = page.locator('nav').locator('..');
    await expect(sidebar.getByText('GUEST', { exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('Guest asset detail hides Serial Number, Purchase Details, Financials tab', async ({ page }) => {
    await loginAsGuest(page);

    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');

    // Click Dell Latitude row
    const dellRow = page.locator('tr').filter({ hasText: 'Dell Latitude 5540' }).first();
    await dellRow.click();

    // Detail dialog opens
    await expect(page.getByRole('dialog', { name: 'Asset Details' })).toBeVisible({ timeout: 5000 });

    // Serial Number should NOT be visible for Guest
    await expect(page.getByText('Serial Number')).not.toBeVisible();

    // Purchase Price should NOT be visible for Guest
    await expect(page.getByText('Purchase Price')).not.toBeVisible();

    // Purchase Date should NOT be visible for Guest
    await expect(page.getByText('Purchase Date')).not.toBeVisible();

    // Financials tab should NOT be visible for Guest
    await expect(page.getByRole('tab', { name: 'Financials' })).not.toBeVisible();

    // Overview, Condition, History, Maintenance, Audit tabs should still be visible
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Audit' })).toBeVisible();

    // No "Invalid Date" should appear (createdAt/updatedAt are not stripped)
    await expect(page.getByText('Invalid Date')).not.toBeVisible();
  });

  test('Guest limited sidebar — no Admin Hub or accountability links', async ({ page }) => {
    await loginAsGuest(page);

    // Guest sidebar should only have Dashboard and Assets under INVENTORY
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Assets' })).toBeVisible();

    // Guest should NOT see admin-only nav links
    await expect(page.getByRole('link', { name: 'Admin Hub' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Issuances' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Profiles' })).not.toBeVisible();
  });
});