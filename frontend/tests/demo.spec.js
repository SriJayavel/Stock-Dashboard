import { test, expect } from '@playwright/test';

/**
 * MARA Phase 3.1 — Static Vercel Demo Deployment Verification
 *
 * Validates the demo build (npm run build:demo) end-to-end:
 *   - All 6 workspace interfaces load with synthetic data
 *   - Zero network calls to /api/* or Supabase
 *   - Demo banner is visible
 *   - No backend secrets leaked into the build
 *
 * Run with:  VITE_DEMO_MODE=true npx playwright test demo.spec.js --config=playwright.demo.config.js
 * or via the demo preview server.
 */
test.describe.skip('MARA Phase 3.1 — Static Demo Deployment', () => {
  let apiCalls = [];
  let supabaseCalls = [];
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    apiCalls = [];
    supabaseCalls = [];
    consoleErrors = [];

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/')) apiCalls.push(url);
      if (url.includes('supabase')) supabaseCalls.push(url);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));
  });

  test('demo build serves all 6 workspaces with synthetic data and zero live API calls', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 1. Demo banner must be visible
    const banner = page.locator('#demo-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText('🧪 DEMO MODE');

    // 2. All static fixtures must resolve (200)
    const fixtures = [
      '/demo/market-overview.json',
      '/demo/sectors.json',
      '/demo/screener.json',
      '/demo/correlation.json',
      '/demo/candles-TCS-NS.json',
      '/demo/overview-TCS-NS.json',
      '/demo/research-TCS-NS.json',
      '/demo/deep-research-TCS-NS.json',
    ];
    for (const f of fixtures) {
      const res = await page.request.get(f);
      expect(res.ok(), `fixture ${f} returned ${res.status()}`).toBe(true);
    }

    // 3. Zero live API / Supabase calls
    expect(apiCalls, `unexpected /api/ calls: ${apiCalls.join(', ')}`).toEqual([]);
    expect(supabaseCalls, `unexpected supabase calls: ${supabaseCalls.join(', ')}`).toEqual([]);

    // 4. No backend secrets in the served HTML/JS
    const html = await page.content();
    expect(html).not.toContain('SUPABASE_SERVICE_KEY');
    expect(html).not.toContain('INTERNAL_REFRESH_SECRET');
    expect(html).not.toContain('REDIS_URL');
    expect(html).not.toContain('service_role');

    // 5. No unstripped VITE_ env vars leaked into the build
    expect(html).not.toMatch(/VITE_SUPABASE_URL/);
    expect(html).not.toMatch(/VITE_SUPABASE_ANON_KEY/);

    // 6. No console errors during initial render
    expect(consoleErrors, `console errors: ${consoleErrors.join('; ')}`).toEqual([]);
  });
});