import { test, expect } from '@playwright/test';
import { setupTestAuth, setupMockApi, DEFAULT_BENCHMARKS } from './helpers/mockApi.js';

test.describe('MARA Phase 2.2 — Markets Workspace Deterministic Verification', () => {

  test.beforeEach(async ({ page }) => {
    // Deterministic test auth bypass (strictly unavailable in production builds)
    await setupTestAuth(page);
    // Clear localStorage to prevent test interference from previous snapshots
    await page.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {}
    });
  });

  test('1. Table header contains exactly 7 columns and body has zero Action buttons', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the table to render
    const table = page.locator('#markets-indices-table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Assert exact 7 columns in the header
    const headers = page.locator('#markets-indices-table thead tr th');
    await expect(headers).toHaveCount(7);

    // Verify header column titles
    const headerTexts = await headers.allInnerTexts();
    expect(headerTexts).toEqual(['REGION', 'BENCHMARK INDEX', 'TICKER', 'LAST PRICE', 'NET CHANGE', 'PREV. CLOSE %', 'SESSION RANGE']);

    // Assert zero per-row Analyze action buttons in tbody
    const actionBtns = page.locator('#markets-indices-table-body .markets-table-action-btn');
    await expect(actionBtns).toHaveCount(0);
  });

  test('2. Skeleton state: renders skeleton placeholder rows with exactly 7 cells each', async ({ page }) => {
    // Capture console messages and errors for debugging
    const consoleMessages = [];
    page.on('console', (msg) => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      consoleMessages.push(`PAGE ERROR: ${err.message}\nSTACK: ${err.stack}`);
    });

    // Mock only the necessary APIs: supabase, delayed market overview, and sector intelligence
    await page.route('**/supabase.co/**', (route) => route.fulfill({ status: 200, body: '{}' }));

    // Delayed market overview to capture skeleton state
    await page.route('**/api/markets/overview', async (route) => {
      console.log('[TEST] Market overview route intercepted, delaying 1.5s');
      await new Promise((r) => setTimeout(r, 1500));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hero: { symbol: '^NSEI', name: 'NIFTY 50', price: null, status: 'unavailable', freshness: 'OFFLINE', is_stale: false },
          macro: { Indices: [], Forex: [], Commodities: [], Crypto: [] },
          feed_health: { Indices: 'OFFLINE', Forex: 'OFFLINE', Commodities: 'OFFLINE', Crypto: 'OFFLINE' },
          market_status: 'unavailable',
          is_stale: false,
        }),
      });
    });

    // Mock sector intelligence to prevent errors after market overview returns
    await page.route('**/api/analytics/sectors', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sectors: [
            { sector: 'Technology', display_name: 'Information Technology', performance_24h_pct: 1.25, indian_proxy: '^CNXIT', benchmark_etf: 'XLK', leading_asset: 'TCS.NS', constituents: [{ symbol: 'TCS.NS', role: 'Anchor' }] },
            { sector: 'Financials', display_name: 'Financial Services', performance_24h_pct: 0.85, indian_proxy: '^NSEBANK', benchmark_etf: 'XLF', leading_asset: 'HDFCBANK.NS', constituents: [{ symbol: 'HDFCBANK.NS', role: 'Anchor' }] },
          ],
        }),
      });
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');

    // Wait a bit for the async workspace switch to complete
    await page.waitForTimeout(3000);

    // Print console messages for debugging
    console.log('=== BROWSER CONSOLE ===');
    consoleMessages.forEach(msg => console.log(msg));

    // Check if table body has skeleton rows
    const tableBody = page.locator('#markets-indices-table-body');
    const tableBodyHtml = await tableBody.innerHTML();
    console.log('=== TABLE BODY HTML ===');
    console.log(tableBodyHtml);

    // Wait for skeleton rows to appear
    const skeletonRows = page.locator('.benchmark-row.skeleton-row');
    await expect(skeletonRows.first()).toBeVisible({ timeout: 15000 });
    const skeletonCount = await skeletonRows.count();
    expect(skeletonCount).toBe(7);

    // Assert every skeleton row has exactly 7 cells and zero action buttons
    for (let i = 0; i < skeletonCount; i++) {
      const row = skeletonRows.nth(i);
      const cells = row.locator('td');
      await expect(cells).toHaveCount(7);
      const rowActionBtns = row.locator('.markets-table-action-btn');
      await expect(rowActionBtns).toHaveCount(0);
    }
  });

  test('3. Populated state: asserts real benchmark rows exist, each having 7 cells, role="row", and tabindex="0"', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');

    // Wait for real populated rows
    const realRows = page.locator('.benchmark-row:not(.skeleton-row)');
    await expect(realRows.first()).toBeVisible({ timeout: 10000 });

    const rowCount = await realRows.count();
    expect(rowCount).toBe(7);

    // Check specific critical benchmarks
    const niftyRow = page.locator('.benchmark-row[data-sym="^NSEI"]');
    const sensexRow = page.locator('.benchmark-row[data-sym="^BSESN"]');
    const sp500Row = page.locator('.benchmark-row[data-sym="^GSPC"]');

    await expect(niftyRow).toBeVisible();
    await expect(sensexRow).toBeVisible();
    await expect(sp500Row).toBeVisible();

    // Verify cell count, accessibility semantics, and keyboard focusability on every populated row
    for (let i = 0; i < rowCount; i++) {
      const row = realRows.nth(i);
      await expect(row.locator('td')).toHaveCount(7);
      await expect(row).toHaveAttribute('role', 'row');
      await expect(row).toHaveAttribute('tabindex', '0');
    }

    // Verify price formatting is rendered
    const niftyPrice = niftyRow.locator('td').nth(3);
    await expect(niftyPrice).toContainText('₹24,850.25');
  });

  test('4. Pointer & keyboard interactions: single-click inspects, double-click & Enter/Space navigate', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');

    const realRows = page.locator('.benchmark-row:not(.skeleton-row)');
    await expect(realRows.first()).toBeVisible({ timeout: 10000 });

    const secondRow = realRows.nth(1); // ^BSESN
    const secondSym = await secondRow.getAttribute('data-sym');
    expect(secondSym).toBe('^BSESN');

    // 4a. Single-click: Selects and updates Context Inspector WITHOUT navigating away
    await secondRow.click();
    await expect(secondRow).toHaveClass(/active-row/);
    expect(page.url()).toContain('#/markets'); // Did not navigate away

    // Check Context Inspector content was populated for ^BSESN (SENSEX)
    const inspectorActionBtn = page.locator('#inspector-action-btn');
    await expect(inspectorActionBtn).toBeAttached();
    await expect(inspectorActionBtn).toContainText('Analyze SENSEX');

    // Open context panel if closed to verify visible inspector button
    const isPanelOpen = await page.locator('.mara-app').evaluate((el) => el.classList.contains('context-panel-open'));
    if (!isPanelOpen) {
      await page.locator('#mara-context-toggle').click();
    }
    await expect(inspectorActionBtn).toBeVisible();

    // 4b. Keyboard focus is visible
    await secondRow.focus();
    await expect(secondRow).toBeFocused();

    // 4c. Double-click: Navigates to chart analysis workstation
    await secondRow.dblclick();
    await page.waitForURL(/#\/symbol\/.*\/chart/, { timeout: 8000 });
    expect(page.url()).toMatch(/#\/symbol\/(\^BSESN|%5EBSESN)\/chart/);

    // 4d. Keyboard Enter: Returns to markets and tests Enter key navigation
    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#workspace-markets')).toHaveClass(/active/, { timeout: 10000 });
    const firstRow = page.locator('.benchmark-row[data-sym="^NSEI"]');
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/#\/symbol\/.*\/chart/, { timeout: 8000 });
    expect(page.url()).toMatch(/#\/symbol\/(\^NSEI|%5ENSEI)\/chart/);

    // 4e. Keyboard Space: Returns to markets and tests Space key navigation
    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#workspace-markets')).toHaveClass(/active/, { timeout: 10000 });
    const thirdRow = page.locator('.benchmark-row[data-sym="^NSEBANK"]');
    await expect(thirdRow).toBeVisible({ timeout: 10000 });
    await thirdRow.focus();
    await page.keyboard.press('Space');
    await page.waitForURL(/#\/symbol\/.*\/chart/, { timeout: 8000 });
    expect(page.url()).toMatch(/#\/symbol\/(\^NSEBANK|%5ENSEBANK)\/chart/);
  });

  test('5. Feed status bar: DELAYED label when feed_health indicates delayed data', async ({ page }) => {
    await setupMockApi(page, {
      marketsOverview: {
        hero: { symbol: '^NSEI', name: 'NIFTY 50', price: 24850.25, status: 'delayed', freshness: 'DELAYED', is_stale: false, source: 'yfinance', retrieved_at: new Date().toISOString() },
        macro: { Indices: DEFAULT_BENCHMARKS, Forex: [], Commodities: [], Crypto: [] },
        feed_health: { Indices: 'DELAYED', Forex: 'OFFLINE', Commodities: 'OFFLINE', Crypto: 'OFFLINE' },
        market_status: 'open',
        last_successful_update: new Date().toISOString(),
        is_stale: false,
      },
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');

    const feedEl = page.locator('#mkt-feed-source');
    await expect(feedEl).toBeVisible({ timeout: 10000 });
    const feedText = await feedEl.innerText();
    expect(feedText).toContain('DELAYED');
    expect(feedText).not.toContain('LIVE');
    expect(feedText).not.toContain('FEED FEED');

    const sessionDot = page.locator('#mkt-session-dot');
    await expect(sessionDot).toHaveClass(/delayed/);
  });

  test('6. Feed status bar: CACHED label when is_stale=true with valid cached prices', async ({ page }) => {
    await setupMockApi(page, {
      marketsOverview: {
        hero: { symbol: '^NSEI', name: 'NIFTY 50', price: 24300.0, status: 'stale', freshness: 'CACHED', is_stale: true, source: 'yfinance', retrieved_at: '2026-10-22T03:00:00Z' },
        macro: {
          Indices: DEFAULT_BENCHMARKS.map((b) => ({ ...b, is_stale: true })),
          Forex: [], Commodities: [], Crypto: []
        },
        feed_health: { Indices: 'STALE', Forex: 'OFFLINE', Commodities: 'OFFLINE', Crypto: 'OFFLINE' },
        market_status: 'closed',
        last_successful_update: '2026-10-22T03:00:00Z',
        last_updated: '2026-10-22T03:00:00Z',
        is_stale: true,
      },
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');

    const feedEl = page.locator('#mkt-feed-source');
    await expect(feedEl).toBeVisible({ timeout: 10000 });
    const feedText = await feedEl.innerText();
    expect(feedText).toContain('CACHED');
    expect(feedText).not.toContain('LIVE');

    const sessionDot = page.locator('#mkt-session-dot');
    await expect(sessionDot).toHaveClass(/stale/);
  });

  test('7. Feed status bar: OFFLINE label and empty/offline state when no prices are available', async ({ page }) => {
    await setupMockApi(page, {
      marketsOverview: {
        hero: { symbol: '^NSEI', name: 'NIFTY 50', price: null, status: 'unavailable', freshness: 'OFFLINE', is_stale: false, source: null, retrieved_at: null },
        macro: { Indices: [], Forex: [], Commodities: [], Crypto: [] },
        feed_health: { Indices: 'OFFLINE', Forex: 'OFFLINE', Commodities: 'OFFLINE', Crypto: 'OFFLINE' },
        market_status: 'unavailable',
        last_successful_update: null,
        last_updated: null,
        is_stale: false,
      },
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');

    const feedEl = page.locator('#mkt-feed-source');
    await expect(feedEl).toBeVisible({ timeout: 10000 });
    const feedText = await feedEl.innerText();
    expect(feedText).toContain('OFFLINE');
    expect(feedText).not.toContain('LIVE');
    expect(feedText).not.toContain('DELAYED');

    const sessionDot = page.locator('#mkt-session-dot');
    await expect(sessionDot).toHaveClass(/offline/);

    const breadthEl = page.locator('#mkt-breadth-val');
    await expect(breadthEl).toContainText('FEED OFFLINE');

    // Benchmark rows show empty/unavailable state
    const firstRow = page.locator('.benchmark-row').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.locator('td').nth(3)).toContainText('—');
    await expect(firstRow.locator('td').nth(6)).toContainText('Feed unavailable');
  });

  test('8. Feed status bar: Recent timestamp alone never classifies feed as LIVE without explicit provider confirmation', async ({ page }) => {
    await setupMockApi(page, {
      marketsOverview: {
        hero: {
          symbol: '^NSEI',
          name: 'NIFTY 50',
          price: 24850.25,
          status: 'delayed',
          freshness: 'DELAYED',
          is_stale: false,
          source: 'yfinance',
          retrieved_at: new Date().toISOString(), // fresh timestamp
        },
        macro: { Indices: DEFAULT_BENCHMARKS, Forex: [], Commodities: [], Crypto: [] },
        feed_health: { Indices: 'DELAYED', Forex: 'DELAYED', Commodities: 'DELAYED', Crypto: 'DELAYED' },
        market_status: 'open',
        last_successful_update: new Date().toISOString(), // fresh timestamp
        is_stale: false,
      },
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');

    const feedEl = page.locator('#mkt-feed-source');
    await expect(feedEl).toBeVisible({ timeout: 10000 });
    const text = await feedEl.innerText();
    expect(text).toContain('DELAYED');
    expect(text).not.toContain('LIVE');
  });

  test('9. Feed status bar: LIVE label rendered when explicit backend feed_health=LIVE is confirmed', async ({ page }) => {
    await setupMockApi(page, {
      marketsOverview: {
        hero: {
          symbol: '^NSEI',
          name: 'NIFTY 50',
          price: 24850.25,
          status: 'live',
          freshness: 'LIVE',
          is_stale: false,
          source: 'NSE Direct',
          retrieved_at: new Date().toISOString(),
        },
        macro: { Indices: DEFAULT_BENCHMARKS, Forex: [], Commodities: [], Crypto: [] },
        feed_health: { Indices: 'LIVE', Forex: 'DELAYED', Commodities: 'DELAYED', Crypto: 'DELAYED' },
        market_status: 'open',
        last_successful_update: new Date().toISOString(),
        is_stale: false,
      },
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');

    const feedEl = page.locator('#mkt-feed-source');
    await expect(feedEl).toBeVisible({ timeout: 10000 });
    const text = await feedEl.innerText();
    expect(text).toContain('LIVE');

    const sessionDot = page.locator('#mkt-session-dot');
    await expect(sessionDot).not.toHaveClass(/offline/);
    await expect(sessionDot).not.toHaveClass(/stale/);
    await expect(sessionDot).not.toHaveClass(/delayed/);
  });
});
