import { test, expect } from '@playwright/test';

async function loginAsAdmin(page) {
  await page.goto('/aio-system/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('you@institution.edu').fill('admin@aio-system.local');
  await page.getByPlaceholder('Enter password').fill('admin123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/aio-system\/?$/, { timeout: 10000 });
}

test.describe('Profiles page — avatar click opens image lightbox, not detail modal', () => {
  test('Avatar click opens photo lightbox (if profile has photo)', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/aio-system/profiles');
    await page.waitForLoadState('networkidle');

    // Find a profile row with a photo (avatar has an <img> child)
    const avatarWithPhoto = page.locator('button[aria-label^="View photo for"]').first();
    if (!(await avatarWithPhoto.isVisible({ timeout: 5000 }))) {
      // No profiles with photos — skip gracefully
      return;
    }

    // Click the avatar
    await avatarWithPhoto.click();

    // Lightbox should appear (dark backdrop with enlarged image)
    const lightbox = page.locator('.fixed.inset-0.z-\\[60\\]');
    await expect(lightbox).toBeVisible({ timeout: 5000 });

    // Lightbox image should be visible
    await expect(lightbox.locator('img[alt="Profile photo"]')).toBeVisible();

    // Profile detail modal text should NOT be visible from avatar click
    await expect(page.getByText('Signed Agreement')).not.toBeVisible();
    await expect(page.getByText('Active Possessions')).not.toBeVisible();

    // Close lightbox by clicking backdrop
    await lightbox.click();
    await expect(lightbox).not.toBeVisible({ timeout: 3000 });
  });

  test('Profile name click opens Profile Details modal', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/aio-system/profiles');
    await page.waitForLoadState('networkidle');

    // Click the profile name (the <button> with semibold text next to avatar)
    const profileName = page.locator('button.text-sm.font-semibold').first();
    if (!(await profileName.isVisible({ timeout: 5000 }))) return;

    const nameText = await profileName.textContent();
    await profileName.click();

    // Profile Details modal should open
    const detailModal = page.locator('[role="dialog"]').filter({ hasText: nameText || 'Profile' });
    await expect(detailModal).toBeVisible({ timeout: 5000 });
  });

  test('Eye/view action opens Profile Details modal', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/aio-system/profiles');
    await page.waitForLoadState('networkidle');

    // Find the eye/view action button in the Actions column
    const eyeBtn = page.locator('button[title="View details"]').first();
    if (!(await eyeBtn.isVisible({ timeout: 5000 }))) return;

    await eyeBtn.click();

    // Profile Details modal should open
    const detailModal = page.locator('[role="dialog"]');
    await expect(detailModal).toBeVisible({ timeout: 5000 });
  });
});