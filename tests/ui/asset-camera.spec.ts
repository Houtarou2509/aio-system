import { test, expect } from '@playwright/test';

async function loginAsAdmin(page) {
  await page.goto('/aio-system/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Username').fill('local');
  await page.getByPlaceholder('Password').fill('admin123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/aio-system/**');
}

test.describe('Asset Camera', () => {
  test('Take Photo button exists in Add Asset modal', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /add asset/i }).click();
    await expect(page.getByRole('button', { name: /take photo/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /upload image/i })).toBeVisible();
  });

  test('Take Photo button exists in Edit Asset modal', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');
    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await expect(page.getByRole('button', { name: /take photo/i })).toBeVisible();
    }
  });
});