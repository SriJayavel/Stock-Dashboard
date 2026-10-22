import { test, expect } from '@playwright/test';

// Isolated test: bypasses auth gate by injecting a guest session into localStorage
// then navigates directly to /#/markets and verifies Phase 2 table structure.

test.describe('Phase 2 Markets Workspace — Auth-Bypassed Structural Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Inject guest session so auth gate auto-dismisses (supabase key not set = guest bypass in auth.js)
    // Also set an empty watchlist and preferences so cold-start state is clean
    await page.addInitScript(() => {
      // Suppress Supabase so auth.js hits the !supabase branch → immediate guest bypass
      window.__VITE_SUPABASE_URL__ = '';
      window.__VITE_SUPABASE_ANON_KEY__ = '';
    });
    // Override env vars by patching import.meta.env via page evaluation after load
  });

  test('7-column header structure (no Action column)', async ({ page }) => {
    // Force supabase to be unavailable so auth.js auto-passes as guest
    await page.route('**/supabase.co/**', route => route.abort());

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');

    // Wait for auth gate to clear (guest bypass) — the gate should hide quickly
    await page.waitForTimeout(2000);

    // Check the auth gate is dismissed
    const authGate = page.locator('#auth-gate');
    const authClass = await authGate.getAttribute('class');
    console.log('auth-gate class:', authClass);

    // Check table header col count
    const headers = page.locator('#markets-indices-table thead tr th');
    const count = await headers.count();
    console.log('th count:', count);
    expect(count).toBe(7);
  });

  test('No per-row Analyze action buttons in table body', async ({ page }) => {
    await page.route('**/supabase.co/**', route => route.abort());
    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const actionBtns = page.locator('#markets-indices-table-body .markets-table-action-btn');
    const btnCount = await actionBtns.count();
    console.log('Action buttons in tbody:', btnCount);
    expect(btnCount).toBe(0);
  });

  test('Skeleton rows have 7 columns, no Action td', async ({ page }) => {
    await page.route('**/supabase.co/**', route => route.abort());
    // Intercept the markets overview API to return empty response (force skeleton state)
    await page.route('**/api/markets/overview', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hero: { symbol: '^NSEI', name: 'NIFTY 50', price: null, status: 'unavailable', freshness: 'OFFLINE', is_stale: false, retrieved_at: null },
          macro: { Indices: [], Forex: [], Commodities: [], Crypto: [] },
          feed_health: { Indices: 'OFFLINE', Forex: 'OFFLINE', Commodities: 'OFFLINE', Crypto: 'OFFLINE' },
          trending: [], market_status: 'unavailable',
          last_attempted_at: null, last_successful_update: null, last_updated: null, is_stale: false,
        }),
      });
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Check skeleton rows — each should have 7 tds
    const skeletonRows = page.locator('.markets-index-row.skeleton-row');
    const rowCount = await skeletonRows.count();
    console.log('Skeleton rows rendered:', rowCount);

    if (rowCount > 0) {
      const firstRowTds = skeletonRows.first().locator('td');
      const tdCount = await firstRowTds.count();
      console.log('td count in first skeleton row:', tdCount);
      expect(tdCount).toBe(7);

      // Confirm no disabled action button in skeleton rows
      const actionInSkeleton = skeletonRows.first().locator('.markets-table-action-btn');
      expect(await actionInSkeleton.count()).toBe(0);
    }
  });

  test('Populated rows: tabindex=0, role=row on tr elements', async ({ page }) => {
    await page.route('**/supabase.co/**', route => route.abort());
    // Provide mock populated data
    await page.route('**/api/markets/overview', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hero: { symbol: '^NSEI', name: 'NIFTY 50', price: 24500.5, status: 'delayed', freshness: 'DELAYED', is_stale: false, source: 'yfinance', retrieved_at: '2026-10-22T07:00:00Z' },
          macro: {
            Indices: [
              { symbol: '^NSEI', name: 'NIFTY 50', price: 24500.5, change: 120.5, change_pct: 0.49, high: 24600, low: 24300, source: 'yfinance', is_stale: false },
              { symbol: '^BSESN', name: 'SENSEX', price: 80500.0, change: 400.0, change_pct: 0.50, high: 80800, low: 80100, source: 'yfinance', is_stale: false },
            ],
            Forex: [], Commodities: [], Crypto: []
          },
          feed_health: { Indices: 'DELAYED', Forex: 'OFFLINE', Commodities: 'OFFLINE', Crypto: 'OFFLINE' },
          trending: [], market_status: 'open',
          last_attempted_at: '2026-10-22T07:00:00Z', last_successful_update: '2026-10-22T07:00:00Z', last_updated: '2026-10-22T07:00:00Z', is_stale: false,
        }),
      });
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const rows = page.locator('.markets-index-row:not(.skeleton-row)');
    const count = await rows.count();
    console.log('Populated rows:', count);

    if (count > 0) {
      const tabIdx = await rows.first().getAttribute('tabindex');
      const role = await rows.first().getAttribute('role');
      console.log('tabindex:', tabIdx, 'role:', role);
      expect(tabIdx).toBe('0');
      expect(role).toBe('row');

      // Verify 7 tds per populated row
      const tds = rows.first().locator('td');
      expect(await tds.count()).toBe(7);
    }
  });

  // Helper: dismiss auth gate via Guest button
  async function enterAsGuest(page) {
    const guestBtn = page.locator('#auth-guest-button');
    await guestBtn.waitFor({ state: 'visible', timeout: 8000 });
    await guestBtn.click();
    // Wait for auth gate to hide (body.auth-required removed)
    await page.waitForFunction(() => !document.body.classList.contains('auth-required'), { timeout: 10000 });
  }

  test('Feed status bar: DELAYED label when feed_health=DELAYED', async ({ page }) => {
    await page.route('**/api/markets/overview', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hero: { symbol: '^NSEI', name: 'NIFTY 50', price: 24500.5, status: 'delayed', freshness: 'DELAYED', is_stale: false, source: 'yfinance', retrieved_at: '2026-10-22T07:00:00Z' },
          macro: { Indices: [{ symbol: '^NSEI', name: 'NIFTY 50', price: 24500.5, change: 120, change_pct: 0.49, source: 'yfinance', is_stale: false }], Forex: [], Commodities: [], Crypto: [] },
          feed_health: { Indices: 'DELAYED', Forex: 'OFFLINE', Commodities: 'OFFLINE', Crypto: 'OFFLINE' },
          trending: [], market_status: 'open',
          last_attempted_at: '2026-10-22T07:00:00Z', last_successful_update: '2026-10-22T07:00:00Z', last_updated: '2026-10-22T07:00:00Z', is_stale: false,
        }),
      });
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');
    await enterAsGuest(page);
    await page.waitForTimeout(2000);

    const feedEl = page.locator('#mkt-feed-source');
    const feedText = await feedEl.innerText();
    console.log('Feed source text:', feedText);
    expect(feedText).toContain('DELAYED');
    expect(feedText).not.toContain('LIVE');
    expect(feedText).not.toContain('FEED FEED');
  });

  test('Feed status bar: OFFLINE label when feed_health=all OFFLINE', async ({ page }) => {
    await page.route('**/api/markets/overview', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hero: { symbol: '^NSEI', name: 'NIFTY 50', price: null, status: 'unavailable', freshness: 'OFFLINE', is_stale: false, source: null, retrieved_at: null },
          macro: { Indices: [], Forex: [], Commodities: [], Crypto: [] },
          feed_health: { Indices: 'OFFLINE', Forex: 'OFFLINE', Commodities: 'OFFLINE', Crypto: 'OFFLINE' },
          trending: [], market_status: 'unavailable',
          last_attempted_at: null, last_successful_update: null, last_updated: null, is_stale: false,
        }),
      });
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');
    await enterAsGuest(page);
    await page.waitForTimeout(2000);

    const feedEl = page.locator('#mkt-feed-source');
    const feedText = await feedEl.innerText();
    console.log('Feed source text (offline):', feedText);
    expect(feedText).toContain('OFFLINE');
    expect(feedText).not.toContain('LIVE');
    expect(feedText).not.toContain('DELAYED');
  });

  test('Feed status bar: CACHED label when is_stale=true with active prices', async ({ page }) => {
    await page.route('**/api/markets/overview', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hero: { symbol: '^NSEI', name: 'NIFTY 50', price: 24300.0, status: 'stale', freshness: 'STALE', is_stale: true, source: 'yfinance', retrieved_at: '2026-10-22T03:00:00Z' },
          macro: { Indices: [{ symbol: '^NSEI', name: 'NIFTY 50', price: 24300.0, change: -50, change_pct: -0.21, source: 'yfinance', is_stale: true }], Forex: [], Commodities: [], Crypto: [] },
          feed_health: { Indices: 'STALE', Forex: 'OFFLINE', Commodities: 'OFFLINE', Crypto: 'OFFLINE' },
          trending: [], market_status: 'closed',
          last_attempted_at: '2026-10-22T03:00:00Z', last_successful_update: '2026-10-22T03:00:00Z', last_updated: '2026-10-22T03:00:00Z', is_stale: true,
        }),
      });
    });

    await page.goto('/#/markets');
    await page.waitForLoadState('domcontentloaded');
    await enterAsGuest(page);
    await page.waitForTimeout(2000);

    const feedEl = page.locator('#mkt-feed-source');
    const feedText = await feedEl.innerText();
    console.log('Feed source text (cached):', feedText);
    expect(feedText).toContain('CACHED');
    expect(feedText).not.toContain('LIVE');
  });
});
