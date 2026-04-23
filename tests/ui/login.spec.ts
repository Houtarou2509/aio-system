import { test, expect } from '@playwright/test';

test.describe('Flow 1 — Login without 2FA', () => {
  test('1-5. Staff login → dashboard with username in header', async ({ page }) => {
    await page.goto('/login');

    // Enter staff credentials
    await page.fill('input[type="email"]', 'staff1@aio-system.local');
    await page.fill('input[type="password"]', 'admin123');

    // Click login
    await page.click('button[type="submit"]');

    // Assert redirect to / (dashboard)
    await expect(page).toHaveURL(/\/$|\/dashboard/, { timeout: 10000 });

    // Assert username appears in sidebar/nav
    await expect(page.locator('text=staff1')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Flow 2 — Login with 2FA', () => {
  test('1-6. Admin login → 2FA screen → dashboard', async ({ page }) => {
    await page.goto('/login');

    // Enter admin credentials
    await page.fill('input[type="email"]', 'admin@aio-system.local');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');

    // Assert 2FA input screen appears
    await expect(page.locator('text=Two-Factor Authentication')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[maxlength="6"]')).toBeVisible();

    // Generate valid TOTP using the secret from global setup
    const speakeasy = await import('speakeasy');
    const secret = process.env.ADMIN_2FA_SECRET!;
    const totp = speakeasy.totp({ secret, encoding: 'base32' });

    await page.fill('input[maxlength="6"]', totp);
    await page.click('button[type="submit"]');

    // Assert redirect to dashboard
    await expect(page).toHaveURL(/\/$|\/dashboard/, { timeout: 10000 });
    await expect(page.locator('text=admin')).toBeVisible({ timeout: 10000 });
  });
});