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
test.describe('MARA Phase 3.1 — Static Demo Deployment', () => {
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
      // Only flag actual Supabase API calls, not chunk filenames containing "supabase"
      if (url.includes('supabase.co') || url.includes('supabase.com')) supabaseCalls.push(url);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.text().startsWith('Failed sector intelligence load:')) {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));
  });

  test('demo loads markets, sector details and charts with zero live API calls', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 1. Demo banner must be visible
    const banner = page.locator('#demo-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText('Synthetic market data');
    await expect(page.locator('#exit-demo-mode-btn')).toBeHidden();

    const sectors = page.locator('#sector-intelligence-grid');
    const tech = sectors.getByRole('gridcell', { name: /Technology/ });
    await expect(sectors.getByRole('gridcell')).toHaveCount(5);
    await expect(tech).toContainText('+1.20%');
    await tech.click();
    const detail = page.locator('#sector-detail-body');
    await expect(detail.getByText('TCS.NS', { exact: true })).toBeVisible();
    await tech.press('ArrowRight');
    await expect(page.locator('#sector-detail-title')).toHaveText('Financial Services Constituents');
    await expect(detail.getByText('HDFCBANK.NS', { exact: true })).toBeVisible();
    await sectors.getByRole('gridcell', { name: /Healthcare/ }).click();
    await expect(detail).toContainText('No constituent data available');

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

    await page.locator('#global-search-input').fill('AAPL');
    await page.locator('#search-dropdown').getByRole('option', { name: /AAPL/ }).click();
    await expect(page).toHaveURL(/AAPL/);
    await expect(page.locator('#tv-chart-container canvas').first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/markets');
    await expect(page.locator('#mara-status-bar')).toBeInViewport();
    await expect(page.locator('#global-search-input')).toBeInViewport();
    const workspaceNavigation = page.getByRole('tablist', { name: 'Workspaces', exact: true });
    const marketsTab = workspaceNavigation.getByRole('tab', { name: 'Markets', exact: true });
    const discoverTab = workspaceNavigation.getByRole('tab', { name: 'Discover', exact: true });
    await expect(workspaceNavigation.getByRole('tab', { name: 'Monitor', exact: true })).toBeInViewport();
    await marketsTab.press('ArrowRight');
    await expect(discoverTab).toBeFocused();
    await expect(marketsTab).toHaveAttribute('aria-selected', 'true');
    await discoverTab.press('Enter');
    await expect(discoverTab).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/#\/discover$/);

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
