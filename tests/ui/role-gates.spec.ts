import { test, expect } from '@playwright/test';

async function loginAsGuest(page: any) {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'guest1@aio-system.local');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/$|\/dashboard/, { timeout: 10000 });
}

test.describe('Flow 5 — Role-gated UI (Guest user)', () => {
  test('1-7. Guest cannot see Add Asset, purchase price, serial, checkout', async ({ page }) => {
    await loginAsGuest(page);

    // Navigate to assets
    await page.click('text=Assets');
    await expect(page).toHaveURL(/\/assets/);

    // "Add Asset" button should NOT be present
    await expect(page.locator('text=Add Asset')).not.toBeVisible();

    // Click into an asset row
    const assetRow = page.locator('tr, .asset-row, [data-testid="asset-row"]').filter({ hasText: 'Dell Latitude' }).first();
    await assetRow.click();

    // Wait for detail modal
    await page.waitForTimeout(1000);

    // Purchase price should NOT be visible (Guest restriction)
    await expect(page.locator('text=Purchase Price')).not.toBeVisible();

    // Serial number should NOT be visible
    await expect(page.locator('text=Serial')).not.toBeVisible();

    // Checkout button should NOT be present
    await expect(page.locator('button:has-text("Checkout")')).not.toBeVisible();
  });
});