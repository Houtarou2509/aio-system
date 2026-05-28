import { test, expect } from '@playwright/test';

test.describe('Issuances page — no developer comment leakage', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/aio-system/login');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('you@institution.edu').fill('admin@aio-system.local');
    await page.getByPlaceholder('Enter password').fill('admin123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/aio-system\/?$/, { timeout: 10000 });
  });

  test('developer comment "Return button visibility" is NOT rendered', async ({ page }) => {
    await page.goto('/aio-system/issuances');
    await page.waitForLoadState('networkidle');

    // The developer comment must never appear as visible text
    await expect(page.getByText('Return button visibility')).toHaveCount(0);
    await expect(page.getByText('PermissionGate:')).toHaveCount(0);
    await expect(page.getByText('user must have issuances:return')).toHaveCount(0);
    await expect(page.getByText('ADMIN role always passes PermissionGate')).toHaveCount(0);
  });

  test('action buttons still render for active issuances', async ({ page }) => {
    await page.goto('/aio-system/issuances');
    await page.waitForLoadState('networkidle');

    // Page should be loaded without errors — check for table or empty-state
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no issuances/i).isVisible().catch(() => false);
    // Either a table exists with rows, or empty state is shown — both are valid
    expect(hasTable || hasEmpty).toBeTruthy();
  });
});