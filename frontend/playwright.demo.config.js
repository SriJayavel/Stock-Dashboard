import { defineConfig } from '@playwright/test';
const port = process.env.MARA_DEMO_TEST_PORT || '8173';
const baseURL = `http://127.0.0.1:${port}`;

// Serve the pre-built demo dist directory so the spec validates the shipped
// artifact (npm run build:demo), not the dev server.
const webServer = {
  command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
  url: baseURL,
  reuseExistingServer: !process.env.CI,
  timeout: 30000,
};

export default defineConfig({
  testDir: './tests',
  testMatch: process.env.MARA_VISUAL === '1' ? ['**/visual.spec.js'] : ['**/demo.spec.js'],
  outputDir: process.env.MARA_VISUAL === '1' ? 'test-results/visual' : 'test-results/demo',
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
