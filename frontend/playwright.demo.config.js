import { defineConfig } from '@playwright/test';
const port = process.env.MARA_DEMO_TEST_PORT || '8173';
const baseURL = `http://127.0.0.1:${port}`;

// Serve the pre-built demo dist directory so the spec validates the shipped
// artifact (npm run build:demo), not the dev server.
const webServer = {
  command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
  url: baseURL,
  reuseExistingServer: false,
  timeout: 30000,
};

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/demo.spec.js'],
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL,
    channel: process.env.CI ? 'chromium' : 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
  },
  webServer,
});
