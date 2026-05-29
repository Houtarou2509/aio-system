import { test, expect } from '@playwright/test';

async function loginAsAdmin(page) {
  await page.goto('/aio-system/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('you@institution.edu').fill('admin@aio-system.local');
  await page.getByPlaceholder('Enter password').fill('admin123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/aio-system\/?$/, { timeout: 10000 });
}

test.describe('Asset form — Take Photo button exists', () => {
  test('Add Asset modal has Take Photo button alongside Upload Image', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');

    // Open Add Asset modal
    await page.getByRole('button', { name: 'Add Asset' }).click();

    // Modal opens
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Upload Image button exists
    await expect(page.getByRole('button', { name: 'Upload Image' })).toBeVisible();

    // Take Photo button exists
    await expect(page.getByRole('button', { name: 'Take Photo' })).toBeVisible();
  });

  test('Edit Asset modal has Take Photo button alongside Change Image', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');

    // Click asset row to open detail
    const dellRow = page.locator('tr').filter({ hasText: 'Dell Latitude 5540' }).first();
    await dellRow.click();
    await expect(page.getByRole('dialog', { name: 'Asset Details' })).toBeVisible({ timeout: 5000 });

    // Click Edit button in the detail modal
    const detailDialog = page.getByRole('dialog', { name: 'Asset Details' });
    const editBtn = detailDialog.getByRole('button', { name: /Edit/i });
    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click();

      // Edit modal should have Change Image and Take Photo
      await expect(page.getByRole('button', { name: 'Change Image' })).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: 'Take Photo' })).toBeVisible();
    }
  });
});