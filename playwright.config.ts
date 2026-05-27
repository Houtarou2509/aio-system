import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  retries: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  globalSetup: './tests/ui/global-setup',
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'cd server && LOGIN_RATE_LIMIT=100 npx tsx src/index.ts',
      port: 3001,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'cd client && npx vite --port 3000',
      port: 3000,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});