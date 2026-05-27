import { test, expect } from '@playwright/test';

async function loginAs(page, email: string, password: string = 'admin123') {
  await page.goto('/aio-system/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(/\/aio-system\/?$/, { timeout: 15000 });
  // CRITICAL: Wait for the React app to fully render (auth init + sidebar)
  await page.waitForSelector('text=Dashboard', { timeout: 10000 });
}

async function loginAsAdmin(page) {
  await loginAs(page, 'admin@aio-system.local');
}

async function loginAsGuest(page) {
  await loginAs(page, 'guest1@aio-system.local');
}

/** Navigate to a page using direct URL (safe after login) */
async function navigateTo(page, path: string) {
  await page.goto(`/aio-system${path}`, { waitUntil: 'networkidle' });
}

export { loginAs, loginAsAdmin, loginAsGuest, navigateTo };