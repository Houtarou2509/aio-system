import { test, expect } from '@playwright/test';

test.describe('Flow 1 — Staff login', () => {
  test('Staff login → dashboard with STAFF role badge', async ({ page }) => {
    await page.goto('/aio-system/login');
    await page.waitForLoadState('networkidle');

    // Fill login form using placeholders
    await page.getByPlaceholder('you@institution.edu').fill('staff1@aio-system.local');
    await page.getByPlaceholder('Enter password').fill('admin123');

    // Submit
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Assert redirect to dashboard (root path under base)
    await expect(page).toHaveURL(/aio-system\/?$/, { timeout: 10000 });

    // Assert STAFF role badge in sidebar
    await expect(page.getByText('STAFF', { exact: true })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Flow 2 — Admin login', () => {
  test('Admin login → dashboard with ADMIN role badge', async ({ page }) => {
    await page.goto('/aio-system/login');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('you@institution.edu').fill('admin@aio-system.local');
    await page.getByPlaceholder('Enter password').fill('admin123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Admin has twoFactorEnabled: false in test seed, so no 2FA
    await expect(page).toHaveURL(/aio-system\/?$/, { timeout: 10000 });

    // Assert ADMIN role badge in sidebar (scoped to sidebar paragraph)
    const sidebar = page.locator('nav').locator('..');
    await expect(sidebar.getByText('ADMIN', { exact: true })).toBeVisible({ timeout: 10000 });
  });
});