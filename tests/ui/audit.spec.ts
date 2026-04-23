import { test, expect } from '@playwright/test';

async function loginAsAdmin(page: any) {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@aio-system.local');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');

  const twoFaVisible = await page.locator('text=Two-Factor Authentication').isVisible({ timeout: 3000 }).catch(() => false);
  if (twoFaVisible) {
    const speakeasy = await import('speakeasy');
    const secret = process.env.ADMIN_2FA_SECRET!;
    const totp = speakeasy.totp({ secret, encoding: 'base32' });
    await page.fill('input[maxlength="6"]', totp);
    await page.click('button[type="submit"]');
  }

  await expect(page).toHaveURL(/\/$|\/dashboard/, { timeout: 10000 });
}

test.describe('Flow 6 — Audit trail modal', () => {
  test('1-5. View audit history for asset with changes', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to assets
    await page.click('text=Assets');
    await expect(page).toHaveURL(/\/assets/);

    // Click into Dell Latitude asset
    const assetRow = page.locator('tr, .asset-row, [data-testid="asset-row"]').filter({ hasText: 'Dell Latitude' }).first();
    await assetRow.click();

    // Click "audit" tab
    await page.click('text=audit', { timeout: 5000 });

    // Assert at least one audit entry is visible
    await expect(page.locator('[class*="audit"], .space-y-2 > div').first()).toBeVisible({ timeout: 10000 });

    // Assert each entry shows: action badge, field, old→new, timestamp, performed by
    // There should be UPDATE entries
    const updateBadges = page.locator('text=UPDATE');
    await expect(updateBadges.first()).toBeVisible({ timeout: 5000 });

    // Check field name visible (location or currentValue)
    const fieldLabel = page.locator('text=location').or(page.locator('text=currentValue'));
    await expect(fieldLabel.first()).toBeVisible({ timeout: 5000 });

    // Check performed by (admin or staffadmin)
    const performer = page.locator('text=admin').or(page.locator('text=staffadmin'));
    await expect(performer.first()).toBeVisible({ timeout: 5000 });
  });
});