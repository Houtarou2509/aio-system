import { test, expect } from '@playwright/test';

async function loginAsAdmin(page) {
  await page.goto('/aio-system/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Username').fill('local');
  await page.getByPlaceholder('Password').fill('admin123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/aio-system/**');
}

test.describe('SearchableSelect keyboard highlight', () => {
  test('Manufacturer: typing search highlights first real match, not None', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /add asset/i }).click();

    // Open the Manufacturer dropdown
    const manufacturerBtn = page.locator('button', { hasText: /^Manufacturer/ }).first();
    // The trigger button shows label; find it by looking for the label text nearby
    // Instead, click the dropdown trigger — it has the label visible
    await page.locator('label:has-text("Manufacturer") + button').click();

    // Type a search term
    const searchInput = page.locator('input[placeholder*="manufacturer" i]');
    await searchInput.fill('Acer');

    // Press Enter — should select "Acer", not "None"
    await searchInput.press('Enter');

    // The button should now show "Acer" as selected, not "None"
    const triggerBtn = page.locator('label:has-text("Manufacturer") + button');
    await expect(triggerBtn).toContainText('Acer');
  });

  test('Type: typing search selects matching option on Enter', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /add asset/i }).click();

    await page.locator('label:has-text("Type") + button').click();
    const searchInput = page.locator('input[placeholder*="type" i]');
    await searchInput.fill('Laptop');
    await searchInput.press('Enter');

    const triggerBtn = page.locator('label:has-text("Type") + button');
    await expect(triggerBtn).toContainText('Laptop');
  });
});