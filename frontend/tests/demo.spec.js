import { test, expect } from '@playwright/test';

test.describe('Markets and chart interactions', () => {
  test('sorts benchmarks and opens a chart from the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/?freeze=1#/markets');
    const rows = page.locator('#markets-indices-table .benchmark-row');
    await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(8);
    const eighth = await rows.nth(7).boundingBox();
    expect(eighth.y + eighth.height).toBeLessThanOrEqual(768);
    const paths = await rows.locator('polyline').evaluateAll(nodes => nodes.map(node => node.getAttribute('points')));
    expect(paths).toHaveLength(await rows.count());
    expect(new Set(paths).size).toBe(paths.length);
    const before = await rows.evaluateAll(nodes => nodes.map(row => row.dataset.sym));
    const header = page.getByRole('columnheader', { name: 'Last Price' });
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    const after = await rows.evaluateAll(nodes => nodes.map(row => row.dataset.sym));
    expect(after).not.toEqual(before);
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await page.keyboard.press('Control+k');
    await expect(page.locator('#global-search-input')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(shortcuts.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();
    await rows.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/symbol\/.+\/chart/);
    await expect(page.locator('#tv-chart-container')).toHaveAccessibleName(/Last close/);
  });

  test('keeps the chart canvas sharp on touch and resize', async ({ browser, baseURL }) => {
    const page = await browser.newPage({ baseURL, deviceScaleFactor: 2, hasTouch: true });
    try {
      await page.goto('/?freeze=1#/symbol/TCS.NS/chart');
      await expect(page.locator('#tv-chart-container')).toHaveAccessibleName(/Last close/);
      const canvas = page.locator('#tv-chart-container canvas').first();
      await expect.poll(() => canvas.evaluate(node => node.width / node.clientWidth)).toBeCloseTo(2);
      for (const width of [768, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await expect.poll(() => canvas.evaluate(node => node.width / node.clientWidth)).toBeCloseTo(2);
        await expect(page.getByRole('group', { name: 'Chart timeframe' })).toBeVisible();
      }
      const box = await canvas.boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(canvas).toBeVisible();
    } finally {
      await page.close();
    }
  });

  test('contains horizontal scrolling and persists the selected theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?freeze=1#/markets');
    const table = page.getByRole('region', { name: 'Global benchmarks' });
    await expect(table.locator('.benchmark-row').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const scroller = await table.evaluate(node => {
      node.scrollLeft = 200;
      return { scrollLeft: node.scrollLeft, width: node.clientWidth, total: node.scrollWidth };
    });
    expect(scroller.total).toBeGreaterThan(scroller.width);
    expect(scroller.scrollLeft).toBeGreaterThan(0);
    await expect(table.locator('.benchmark-row .col-name').first()).toHaveCSS('position', 'sticky');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.locator('html')).toHaveClass(/light-theme/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/light-theme/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});

test('pauses simulated prices without replacing market rows', async ({ page }) => {
  await page.goto('/#/markets');
  const cell = page.locator('#markets-indices-table .col-price[data-sort-value]').first();
  await expect(cell).toBeVisible();
  const readPrices = () => page.locator('#markets-indices-table .benchmark-row .col-price')
    .evaluateAll(nodes => nodes.map(node => node.textContent.trim()));
  const first = await cell.elementHandle();
  const prices = await readPrices();
  await expect.poll(readPrices).not.toEqual(prices);
  expect(await first.evaluate(node => node.isConnected)).toBe(true);
  const toggle = page.getByRole('button', { name: 'Pause updates' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const paused = await readPrices();
  // A full tick interval must pass with the simulation paused.
  await page.waitForTimeout(2100);
  expect(await readPrices()).toEqual(paused);
});

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
    await page.goto('/?freeze=1');
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

    await page.goto('/#/symbol/TCS.NS/chart');
    const tcsQuote = await (await page.request.get('/demo/overview-TCS-NS.json')).json();
    await expect(page.locator('#tv-leg-close')).toHaveText(tcsQuote.price.toFixed(2));
    await expect(page.locator('#tv-leg-change')).toContainText('O→C');
    await page.locator('#watchlist-drawer-toggle').click();
    const watchlist = page.locator('#watchlist-items-list');
    await expect(watchlist.locator('[data-symbol="TCS.NS"].wl-item-row .wl-item-price'))
      .toHaveText(`₹${tcsQuote.price.toFixed(2)}`);
    const snapshot = await (await page.request.get('/demo/market-overview.json')).json();
    const bitcoin = snapshot.indices.find(({ symbol }) => symbol === 'BTC-USD');
    const euro = snapshot.forex.find(({ symbol }) => symbol === 'EURUSD=X');
    await expect(watchlist.locator('[data-symbol="BTC-USD"].wl-item-row .wl-item-price'))
      .toContainText(bitcoin.price.toFixed(2));
    await expect(watchlist.locator('[data-symbol="EURUSD=X"].wl-item-row .wl-item-price'))
      .toContainText(euro.price.toFixed(4));
    await page.locator('#close-watchlist-drawer-btn').click();

    const indicators = await page.locator('#tv-indicators-menu-btn').boundingBox();
    const events = await page.locator('#tv-toggle-events-btn').boundingBox();
    expect(events.x - (indicators.x + indicators.width)).toBeGreaterThanOrEqual(4);

    const ticks = await page.evaluate(() => {
      const chart = window.apexChartInstance;
      const fillText = chart.ctx.fillText;
      const labels = [];
      chart.ctx.fillText = function (label, x, y) {
        if (x === chart.width - 8) labels.push(label);
        return fillText.call(this, label, x, y);
      };
      try {
        chart.lastRenderTime = 0;
        chart.render();
      } finally {
        chart.ctx.fillText = fillText;
      }
      return labels.map((label) => Number(label.replaceAll(',', '')));
    });
    expect(ticks.length).toBeGreaterThan(2);
    expect(new Set(ticks.slice(1).map((price, index) => price - ticks[index])).size).toBe(1);

    await page.locator('#global-search-input').fill('AAPL');
    await page.locator('#search-dropdown').getByRole('option', { name: /AAPL/ }).click();
    await expect(page).toHaveURL(/AAPL/);
    await expect(page.locator('#tv-chart-container canvas').first()).toBeVisible();
    const aapl = await (await page.request.get('/demo/candles-AAPL.json')).json();
    await expect(page.locator('#tv-leg-close')).toHaveText(aapl.candles.at(-1).close.toFixed(2));
    await expect(page.locator('#tv-data-badge')).toHaveText('SYNTHETIC');

    await page.locator('#range-group [data-range="5D"]').click();
    await expect.poll(() => page.evaluate(() => window.apexChartInstance.visibleCount)).toBe(5);
    await page.locator('#interval-group [data-interval="1wk"]').click();
    await expect(page.locator('#tv-leg-interval')).toHaveText('1W');
    await expect.poll(() => page.evaluate(() => window.apexChartInstance.currentCandles.length))
      .toBeLessThan(aapl.candles.length);
    await page.locator('#interval-group [data-interval="5m"]').click();
    await expect(page.locator('#tv-bb-status')).toContainText('Intraday history is unavailable in demo mode');
    await expect(page.locator('#tv-leg-close')).toHaveText('—');
    await page.locator('#interval-group [data-interval="1d"]').click();
    await expect(page.locator('#tv-leg-close')).toHaveText(aapl.candles.at(-1).close.toFixed(2));

    await page.goto('/#/symbol/%5ENSEI/chart');
    await expect(page.locator('#tv-bb-status')).toHaveText('Synthetic price history');
    await expect(page.locator('#tv-leg-close')).toHaveText(snapshot.indices[0].price.toFixed(2));

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
