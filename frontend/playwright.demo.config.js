import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, 'dist');

// Serve the pre-built demo dist directory so the spec validates the shipped
// artifact (npm run build:demo), not the dev server.
const webServer = existsSync(distDir)
  ? {
      command: `python -m http.server 8173 --directory ${distDir}`,
      url: 'http://localhost:8173',
      reuseExistingService: false,
      timeout: 30000,
    }
  : undefined;

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: webServer ? 'http://localhost:8173' : 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
  },
  webServer,
});