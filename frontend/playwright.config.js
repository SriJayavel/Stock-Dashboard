import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/demo.spec.js', '**/visual.spec.js'],
  timeout: 90000,
  expect: {
    timeout: 15000,
  },
  fullyParallel: false,
  reporter: 'list',
  webServer: {
    command: 'npm run dev -- --host localhost --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
  },
});
