import { test, expect } from '@playwright/test';

async function loginAsAdmin(page) {
  await page.goto('/aio-system/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('you@institution.edu').fill('admin@aio-system.local');
  await page.getByPlaceholder('Enter password').fill('admin123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/aio-system\/?$/, { timeout: 10000 });
}

test.describe('Flow 6 — Audit trail page', () => {
  test('Admin can see audit entries on Audit page', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to audit page
    await page.goto('/aio-system/audit');
    await page.waitForLoadState('networkidle');

    // Audit page heading
    await expect(page.getByRole('heading', { name: 'Audit Trail' })).toBeVisible({ timeout: 10000 });

    // Audit table exists
    await expect(page.getByRole('table')).toBeVisible({ timeout: 5000 });

    // Column headers: Action, Asset Name, Summary (audit table has two "Action" columns — .first() is the data column)
    await expect(page.getByRole('columnheader', { name: 'Action' }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Asset Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Summary' })).toBeVisible();

    // At least one audit entry exists (seeded data creates assets)
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });

    // First row contains visible action text ("Updated" or "Created")
    // Note: the first <td> is an empty icon/expand cell, so scope to the row
    const firstRow = rows.first();
    await expect(firstRow).toContainText(/Updated|Created/);

    // First row shows entity type "INVENTORY" and severity "HIGH" or "MED" or "LOW"
    await expect(firstRow).toContainText(/INVENTORY/);

    // First row shows performer ("admin" or "staffadmin")
    await expect(firstRow).toContainText(/admin|staffadmin/);

    // Asset name column shows seeded asset name
    await expect(firstRow).toContainText(/Dell Latitude|Herman Miller|Cisco Router/);
  });

  test('Audit entry accessible via asset detail dialog', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/aio-system/assets');
    await page.waitForLoadState('networkidle');

    // Click Dell Latitude row
    const dellRow = page.locator('tr').filter({ hasText: 'Dell Latitude 5540' }).first();
    await dellRow.click();

    // Detail dialog opens
    await expect(page.getByRole('dialog', { name: 'Asset Details' })).toBeVisible({ timeout: 5000 });

    // Click Audit tab
    await page.getByRole('tab', { name: 'Audit' }).click();

    // Audit entries should appear inside the dialog
    // Verify at least one audit entry with "Updated" or "Created"
    const dialog = page.getByRole('dialog', { name: 'Asset Details' });
    await expect(dialog.getByText(/Updated|Created/).first()).toBeVisible({ timeout: 5000 });
  });
});