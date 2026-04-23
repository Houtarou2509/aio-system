import { test, expect } from '@playwright/test';

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('admin@aio-system.local');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();

  const twoFaVisible = await page.locator('text=Two-Factor Authentication').isVisible({ timeout: 3000 }).catch(() => false);
  if (twoFaVisible) {
    const speakeasy = await import('speakeasy');
    const secret = process.env.ADMIN_2FA_SECRET!;
    const totp = speakeasy.totp({ secret, encoding: 'base32' });
    await page.locator('input[maxlength="6"]').fill(totp);
    await page.locator('button[type="submit"]').click();
  }

  await expect(page).toHaveURL(/\/$|\/dashboard/, { timeout: 10000 });
}

test.describe('Flow 3 — Create an asset (Admin)', () => {
  test('1-7. Create asset → appears in list', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to assets
    await page.locator('text=Assets').first().click();
    await expect(page).toHaveURL(/\/assets/);

    // Click "Add Asset" button
    await page.locator('text=Add Asset').first().click();

    // Fill form using label-based selectors
    await page.locator('label:has-text("Name") + input, label:has-text("Name *") + input').first().fill('Playwright Test Laptop');

    // Type select
    await page.locator('select').first().selectOption({ label: 'LAPTOP' });

    // Manufacturer
    await page.locator('label:has-text("Manufacturer") + input').fill('Lenovo');

    // Serial Number
    await page.locator('label:has-text("Serial Number") + input').fill('SN-PW-001');

    // Purchase Price
    await page.locator('label:has-text("Purchase Price") + input').fill('35000');

    // Location
    await page.locator('label:has-text("Location") + input').fill('Test Room');

    // Click Create
    await page.locator('button:has-text("Create")').click();

    // Assert new asset appears in list
    await expect(page.locator('text=Playwright Test Laptop')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Flow 4 — Checkout and return asset', () => {
  test('1-11. Checkout → status changes, return → available again', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to assets
    await page.locator('text=Assets').first().click();
    await expect(page).toHaveURL(/\/assets/);

    // Find and click the Dell Latitude row
    const dellRow = page.locator('text=Dell Latitude 5540').first();
    await dellRow.click();

    // Wait for detail modal — click Checkout
    await page.locator('button:has-text("Checkout")').click();

    // Select first user in dropdown
    await page.locator('select').nth(0).selectOption({ index: 1 });

    // Click Checkout in modal
    await page.locator('button:has-text("Checkout")').nth(1).click();

    // Wait for status change — the modal should show ASSIGNED
    await expect(page.locator('text=ASSIGNED').or(page.locator('text=Checked out'))).toBeVisible({ timeout: 10000 });

    // Click Return button
    await page.locator('button:has-text("Return")').click();

    // Select condition
    await page.locator('select').nth(0).selectOption('Good');

    // Click Return in modal
    await page.locator('button:has-text("Return")').nth(1).click();

    // Assert status returns to AVAILABLE
    await expect(page.locator('text=AVAILABLE')).toBeVisible({ timeout: 10000 });
  });
});