import { test, expect } from '@playwright/test';

test.describe('Apex Terminal Comprehensive Smoke Test Suite', () => {
  let consoleErrors = [];
  let failedUrls = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    failedUrls = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const loc = msg.location();
        const url = loc?.url || '';
        // Ignore harmless favicon or external network connection aborts if any
        if (!text.includes('favicon.ico') && !text.includes('net::ERR_CONNECTION_REFUSED') && !url.includes('favicon.ico')) {
          consoleErrors.push(`${text} [at ${url}:${loc?.lineNumber || 0}]`);
        }
      }
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        failedUrls.push(`${res.status()}: ${res.url()}`);
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`${err.message} [Stack: ${err.stack}]`);
    });
  });

  test('Complete interactive controls audit and status bar honesty', async ({ page }) => {
    // 1. Initial Load
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the primary price display to populate (allow up to 30s for cold session handshake)
    const priceEl = page.locator('#stock-current-price');
    await expect(priceEl).not.toHaveText('₹0.00', { timeout: 30000 });
    await expect(priceEl).not.toHaveText('—');
    await page.waitForResponse((res) => res.url().includes('/history') && res.status() === 200, { timeout: 30000 });

    // 2. Status Bar Honesty Verification
    const statusEl = page.locator('#tv-bb-status');
    const tzEl = page.locator('#tv-bb-tz');
    const ageEl = page.locator('#tv-bb-age');

    await expect(statusEl).toBeVisible();
    await expect(tzEl).toBeVisible();
    await expect(ageEl).toBeVisible();

    const statusText = await statusEl.innerText();
    const tzText = await tzEl.innerText();
    const ageText = await ageEl.innerText();

    // Verify it is NOT the static legacy placeholder
    expect(statusText).not.toBe('Connecting...');
    expect(statusText).not.toContain('NSE India · Live Session · UTC+5:30');
    // Must contain real pipeline source attribution
    expect(statusText.includes('Direct') || statusText.includes('Yahoo') || statusText.includes('Cached')).toBeTruthy();
    // Timezone must reflect real exchange
    expect(tzText.includes('IST') || tzText.includes('UTC') || tzText.includes('EDT')).toBeTruthy();
    // Age must reflect live counter
    expect(ageText).toContain('Updated');

    // 3. Navbar & Global Search
    const searchInput = page.locator('#global-search-input');
    const searchHint = page.locator('#search-kbd-hint');
    await searchHint.click();
    await expect(searchInput).toBeFocused();

    // Type query to trigger autocomplete dropdown
    await searchInput.fill('RELI');
    const dropdown = page.locator('#search-dropdown');
    await expect(dropdown).toHaveClass(/open/, { timeout: 5000 });

    // Click outside to close search dropdown
    await page.locator('.brand').click();
    await expect(dropdown).not.toHaveClass(/open/);

    // Brand click should load benchmark
    await page.locator('#brand-home-btn').click();
    await page.waitForResponse((res) => res.url().includes('/history') && res.status() === 200, { timeout: 30000 });

    // 4. Watchlist & Alerts Drawer
    const drawer = page.locator('#watchlist-drawer');
    const alertsNavBtn = page.locator('#alerts-modal-toggle');
    const watchlistNavBtn = page.locator('#watchlist-drawer-toggle');
    const closeDrawerBtn = page.locator('#close-watchlist-drawer-btn');
    const viewAlerts = page.locator('#tv-drawer-view-alerts');
    const viewWatchlist = page.locator('#tv-drawer-view-watchlist');

    // Click Alerts nav button -> opens drawer on Alerts tab
    await alertsNavBtn.click();
    await expect(drawer).toHaveClass(/open/);
    await expect(viewAlerts).toBeVisible();

    // Switch to Watchlist tab
    await page.locator('#drawer-tab-watchlist').click();
    await expect(viewWatchlist).toBeVisible();

    // Close drawer
    await closeDrawerBtn.click();
    await expect(drawer).not.toHaveClass(/open/);

    // Click Watchlist nav button -> opens drawer on Watchlist tab
    await watchlistNavBtn.click();
    await expect(drawer).toHaveClass(/open/);
    await expect(viewWatchlist).toBeVisible();

    // Star toggle button
    const starBtn = page.locator('#stock-watchlist-star-btn');
    const wasStarred = await starBtn.evaluate((el) => el.classList.contains('starred'));
    await starBtn.click();
    const isStarredNow = await starBtn.evaluate((el) => el.classList.contains('starred'));
    expect(isStarredNow).toBe(!wasStarred);
    // Restore star state
    await starBtn.click();

    // Create an alert test
    await page.locator('#drawer-tab-alerts').click();
    await page.locator('#alert-target-input').fill('3800');
    await page.locator('#create-alert-btn').click();
    const alertItems = page.locator('#alerts-list-container > div');
    await expect(alertItems.first()).toBeVisible();

    // Close drawer again
    await closeDrawerBtn.click();
    await expect(drawer).not.toHaveClass(/open/);

    // 5. Chart Top Toolbar Controls
    // Verify zero network requests during interval switching & range navigation
    let historyRequestsCount = 0;
    const historyListener = (req) => {
      if (req.url().includes('/api/stocks/') && req.url().includes('/history')) {
        historyRequestsCount++;
      }
    };
    page.on('request', historyListener);

    // Client-side Interval buttons (D, W, M)
    const intW = page.locator('.interval-btn[data-interval="W"]');
    await intW.click();
    await expect(intW).toHaveClass(/active/);
    await expect(page.locator('#tv-leg-interval')).toHaveText('1W');

    const intM = page.locator('.interval-btn[data-interval="M"]');
    await intM.click();
    await expect(intM).toHaveClass(/active/);
    await expect(page.locator('#tv-leg-interval')).toHaveText('1M');

    const intD = page.locator('.interval-btn[data-interval="D"]');
    await intD.click();
    await expect(intD).toHaveClass(/active/);
    await expect(page.locator('#tv-leg-interval')).toHaveText('1D');

    // Redundant 1D range button should NOT exist
    const redundant1d = page.locator('.range-btn[data-range="1D"]');
    expect(await redundant1d.count()).toBe(0);

    // Client-side Range buttons (1M, 3M, 6M, YTD, 1Y, 5Y, All)
    for (const r of ['1M', '3M', '6M', 'YTD', '5Y', 'All', '1Y']) {
      const rangeBtn = page.locator(`.range-btn[data-range="${r}"]`);
      await rangeBtn.click();
      await expect(rangeBtn).toHaveClass(/active/);
    }

    // Assert that ZERO network requests were triggered during interval resampling or range clicks
    expect(historyRequestsCount).toBe(0);
    page.off('request', historyListener);

    // Symbol button focuses search
    await page.locator('#tv-tb-symbol-btn').click();
    await expect(searchInput).toBeFocused();
    await page.keyboard.press('Escape');

    // Event markers toggle button
    const eventsBtn = page.locator('#tv-toggle-events-btn');
    const hadEventsActive = await eventsBtn.evaluate((el) => el.classList.contains('active'));
    await eventsBtn.click();
    const hasEventsNow = await eventsBtn.evaluate((el) => el.classList.contains('active'));
    expect(hasEventsNow).toBe(!hadEventsActive);
    await eventsBtn.click(); // restore

    // Fullscreen toggle button
    const fsBtn = page.locator('#tv-fullscreen-btn');
    const chartPanel = page.locator('#panel-chart');
    await fsBtn.click();
    await expect(chartPanel).toHaveClass(/chart-fullscreen-mode/);
    await fsBtn.click();
    await expect(chartPanel).not.toHaveClass(/chart-fullscreen-mode/);

    // TV Sidebar Toggle button
    const tvSidebarBtn = page.locator('#tv-sidebar-toggle-btn');
    await tvSidebarBtn.click();
    await expect(drawer).toHaveClass(/open/);
    await tvSidebarBtn.click();
    await expect(drawer).not.toHaveClass(/open/);

    // 6. Left Rail & Bottom Bar Controls
    // Crosshair button
    const railCrosshair = page.locator('#tv-rail-crosshair');
    await railCrosshair.click();
    // Chart type cycle button
    const railChartType = page.locator('#tv-rail-chart-type');
    await expect(railChartType).toHaveAttribute('data-type', 'candles');
    await railChartType.click();
    await expect(railChartType).toHaveAttribute('data-type', 'line');
    await railChartType.click();
    await expect(railChartType).toHaveAttribute('data-type', 'area');
    await railChartType.click();
    await expect(railChartType).toHaveAttribute('data-type', 'candles');

    // Fit / Reset button on left rail
    const railFit = page.locator('#tv-rail-fit');
    await railFit.click();

    // Bottom Bar: Latest & Reset View buttons
    const latestBtn = page.locator('#tv-latest-btn');
    await latestBtn.click();
    const resetBtn = page.locator('#tv-reset-view-btn');
    await resetBtn.click();

    // Scale buttons (LOG / %)
    const logBtn = page.locator('#tv-scale-log-btn');
    const pctBtn = page.locator('#tv-scale-pct-btn');
    await logBtn.click();
    await expect(logBtn).toHaveClass(/active/);
    await pctBtn.click();
    await expect(pctBtn).toHaveClass(/active/);
    await expect(logBtn).not.toHaveClass(/active/);
    await pctBtn.click(); // turn off pct
    await expect(pctBtn).not.toHaveClass(/active/);

    // Live Quote Patching without full reload
    await page.evaluate(() => {
      if (window.apexPatchLatestBar) {
        window.apexPatchLatestBar({
          current_price: 3899.5,
          high: 3920.0,
          low: 3850.0,
          volume: 2500000,
        });
      }
    });
    await expect(page.locator('#tv-leg-close')).toHaveText('3899.50');

    // Draggable Splitters Container
    const splittersContainer = page.locator('#tv-splitters-container');
    await expect(splittersContainer).toBeAttached();

    // 7. Technical Indicator Modal & Settings
    const indModalBtn = page.locator('#tv-indicators-menu-btn');
    const indModal = page.locator('#tv-indicator-picker-modal');
    await indModalBtn.click();
    await expect(indModal).toHaveClass(/open/);

    // Category filter tabs in modal
    const momentumTab = page.locator('#tv-ind-category-tabs .tv-ind-tab[data-category="momentum"]');
    await momentumTab.click();
    await expect(momentumTab).toHaveClass(/active/);

    // Search input in indicator picker
    const indSearchInput = page.locator('#tv-ind-search-input');
    await indSearchInput.fill('Bollinger');
    await page.waitForTimeout(200);
    const clearIndSearch = page.locator('#tv-ind-clear-search');
    await expect(clearIndSearch).toBeVisible();
    await clearIndSearch.click();
    await expect(indSearchInput).toHaveValue('');

    // Close indicator modal via close button
    await page.locator('#close-indicator-picker-btn').click();
    await expect(indModal).not.toHaveClass(/open/);

    // Reopen via left rail button to test singleton addition & toggle removal
    await page.locator('#tv-rail-indicators').click();
    await expect(indModal).toHaveClass(/open/);

    // Test RSI singleton add and toggle off
    const rsiActionBtn = page.locator('.tv-ind-action-btn[data-add-id="rsi"]');
    await expect(rsiActionBtn).toBeVisible();
    await expect(rsiActionBtn).toHaveText('+ Add');

    // Click 1: Adds RSI
    await rsiActionBtn.click();
    await expect(rsiActionBtn).toHaveText('✓ Added');
    await expect(rsiActionBtn).toHaveClass(/active/);

    const rsiCount1 = await page.evaluate(() => {
      return window.apexChartInstance ? window.apexChartInstance.getActiveIndicatorsList().filter((i) => i.id === 'rsi').length : 0;
    });
    expect(rsiCount1).toBe(1);

    // Click 2: Same button clicked again removes RSI (no duplicate, toggles off)
    await rsiActionBtn.click();
    await expect(rsiActionBtn).toHaveText('+ Add');
    await expect(rsiActionBtn).not.toHaveClass(/active/);

    const rsiCount2 = await page.evaluate(() => {
      return window.apexChartInstance ? window.apexChartInstance.getActiveIndicatorsList().filter((i) => i.id === 'rsi').length : 0;
    });
    expect(rsiCount2).toBe(0);

    // Click 3: Re-add RSI and verify programmatic addIndicator('rsi') rejects duplicate
    await rsiActionBtn.click();
    await expect(rsiActionBtn).toHaveText('✓ Added');

    const duplicateResult = await page.evaluate(() => {
      return window.apexChartInstance ? window.apexChartInstance.addIndicator('rsi') : 'no_chart';
    });
    expect(duplicateResult).toBeNull(); // Strictly rejected!

    const rsiCountFinal = await page.evaluate(() => {
      return window.apexChartInstance ? window.apexChartInstance.getActiveIndicatorsList().filter((i) => i.id === 'rsi').length : 0;
    });
    expect(rsiCountFinal).toBe(1);

    await page.keyboard.press('Escape');
    await expect(indModal).not.toHaveClass(/open/);

    // 8. Workspace Navigation Tabs
    const tabsToTest = [
      'overview',
      'fundamentals',
      'valuation',
      'peers',
      'correlation',
      'sectors',
      'earnings',
      'news',
      'whatchanged',
      'anomalies',
      'lab',
      'quality',
      'notebook',
      'report',
      'chart',
    ];

    for (const tabName of tabsToTest) {
      const tabBtn = page.locator(`.ws-tab-btn[data-tab="${tabName}"]`);
      await tabBtn.click();
      await expect(tabBtn).toHaveClass(/active/);
      const panel = page.locator(`#panel-${tabName}`);
      await expect(panel).toHaveClass(/active/);
      expect(page.url()).toContain(tabName);
    }

    // 8b. Top-Level Views Switcher & Hash Routing
    const topTerminal = page.locator('#top-view-terminal');
    const topScreener = page.locator('#top-view-screener');
    const topSectors = page.locator('#top-view-sectors');

    await topScreener.click();
    await expect(topScreener).toHaveClass(/active/);
    expect(page.url()).toContain('#/screener');

    await topSectors.click();
    await expect(topSectors).toHaveClass(/active/);
    await expect(page.locator('#panel-sectors')).toHaveClass(/active/);

    // Verify Sector Heatmap cards and constituent drilldown
    const sectorCards = page.locator('.sector-card');
    await expect(sectorCards.first()).toBeVisible({ timeout: 10000 });
    expect(await sectorCards.count()).toBeGreaterThanOrEqual(6);

    // Click a constituent pill from the sector card -> loads stock into Terminal Chart
    const infyPill = page.locator('.sector-sym-btn[data-sym="INFY.NS"]').first();
    await expect(infyPill).toBeVisible();
    await infyPill.click();
    await expect(page.locator('#panel-chart')).toHaveClass(/active/);
    expect(page.url()).toContain('INFY.NS');

    // Return to Sectors
    await topSectors.click();
    await expect(page.locator('#panel-sectors')).toHaveClass(/active/);

    // Click a sector card to test selection and constituent breakdown table
    const techCard = page.locator('.sector-card[data-sector="Technology"]');
    await techCard.click();
    await expect(techCard).toHaveClass(/selected/);
    await expect(page.locator('#sector-detail-title')).toContainText('Information Technology');

    await topTerminal.click();
    await expect(topTerminal).toHaveClass(/active/);

    // Browser History (Back / Forward)
    await page.goBack();
    await expect(page.locator('#panel-sectors')).toHaveClass(/active/);
    await page.goForward();
    await expect(topTerminal).toHaveClass(/active/);

    // Ensure chart panel is active for chart toolbar controls
    await page.locator('.ws-tab-btn[data-tab="chart"]').click();
    await expect(page.locator('#panel-chart')).toHaveClass(/active/);

    // 9. Specialized Subsystem Checks
    // Multi-Asset Macro Tabs
    for (const cat of ['Forex', 'Commodities', 'Crypto', 'Indices']) {
      const macroTab = page.locator(`.macro-tab-btn[data-category="${cat}"]`);
      await macroTab.click();
      await expect(macroTab).toHaveClass(/active/);
    }

    // Chart Toolbar Alert Button
    const tbAlertBtn = page.locator('#tv-tb-alert-btn');
    await tbAlertBtn.click();
    await expect(drawer).toHaveClass(/open/);
    await expect(viewAlerts).toBeVisible();
    await closeDrawerBtn.click();
    await expect(drawer).not.toHaveClass(/open/);

    // Correlation Period Buttons
    await page.locator('.ws-tab-btn[data-tab="correlation"]').click();
    for (const period of ['6mo', '3mo', '1mo', '1y']) {
      const periodBtn = page.locator(`.corr-tf-btn[data-period="${period}"]`);
      await periodBtn.click();
      await expect(periodBtn).toHaveClass(/active/);
    }

    // Scenario Lab
    await page.locator('.ws-tab-btn[data-tab="lab"]').click();
    const revSlider = page.locator('#scenario-rev-slider');
    await revSlider.fill('15');
    await revSlider.dispatchEvent('input');
    await expect(page.locator('#scenario-rev-val')).toHaveText('+15%');

    // Run Strategy Backtest
    const runBacktestBtn = page.locator('#run-backtest-btn');
    await runBacktestBtn.click();
    await expect(page.locator('#backtest-results-container')).toContainText('Strategy Win Rate', { timeout: 5000 });

    // Research Notebook Inputs & Export
    await page.locator('.ws-tab-btn[data-tab="notebook"]').click();
    const thesisArea = page.locator('#nb-thesis');
    await thesisArea.fill('Test Thesis: Leading market share with robust balance sheet.');
    await page.locator('#export-notebook-btn').click();

    // Research Report Buttons
    await page.locator('.ws-tab-btn[data-tab="report"]').click();
    await expect(page.locator('#report-rendered-preview')).toBeVisible();

    // Screener Card Universes & Query Builder
    const usScreenerTab = page.locator('.screener-tab-btn[data-universe="us_mega_caps"]');
    await usScreenerTab.click();
    await expect(usScreenerTab).toHaveClass(/active/);

    // Toggle Screener Query Builder
    const filterBtn = page.locator('#toggle-screener-builder-btn');
    const builderWrap = page.locator('#screener-builder-wrap');
    await filterBtn.click();
    await expect(builderWrap).toBeVisible();

    const addRuleBtn = page.locator('#screener-add-rule-btn');
    await addRuleBtn.click();
    const ruleRows = page.locator('.screener-rule-row');
    await expect(ruleRows.first()).toBeVisible();

    const runBuilderBtn = page.locator('#screener-run-builder-btn');
    await runBuilderBtn.click();
    await filterBtn.click(); // collapse builder
    await expect(builderWrap).toBeHidden();

    // 10. Console Cleanliness & Network Integrity Assertion
    if (failedUrls.length > 0) {
      console.log('Detected HTTP >= 400 responses:', failedUrls);
    }
    expect(failedUrls).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Deep-link direct URL hash navigation loads asset and panel directly', async ({ page }) => {
    await page.goto('/#/symbol/INFY.NS/fundamentals');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('#panel-fundamentals')).toHaveClass(/active/, { timeout: 25000 });
    await expect(page.locator('#stock-symbol')).toHaveText('INFY.NS', { timeout: 25000 });
    expect(page.url()).toContain('#/symbol/INFY.NS/fundamentals');

    if (failedUrls.length > 0) {
      console.log('Detected HTTP >= 400 responses:', failedUrls);
    }
    expect(failedUrls).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Phase 5: Global keyboard shortcuts (/ search, Esc dismiss, number keys)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForResponse((res) => res.url().includes('/history') && res.status() === 200, { timeout: 30000 });

    const searchInput = page.locator('#global-search-input');
    const drawer = page.locator('#watchlist-drawer');

    // 1. Press '/' when not typing -> focuses search
    await page.keyboard.press('/');
    await expect(searchInput).toBeFocused();

    // 2. Press 'Escape' -> blurs search
    await page.keyboard.press('Escape');
    await expect(searchInput).not.toBeFocused();

    // 3. Open drawer, press 'Escape' -> closes drawer
    await page.locator('#watchlist-drawer-toggle').click();
    await expect(drawer).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(drawer).not.toHaveClass(/open/);

    // 4. Number shortcuts for fast tab navigation: press '3' -> Fundamentals tab
    await page.keyboard.press('3');
    await expect(page.locator('#panel-fundamentals')).toHaveClass(/active/, { timeout: 5000 });
    expect(page.url()).toContain('fundamentals');

    // Press '1' -> returns to Chart
    await page.keyboard.press('1');
    await expect(page.locator('#panel-chart')).toHaveClass(/active/, { timeout: 5000 });
    expect(page.url()).toContain('chart');

    expect(failedUrls).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Phase 5: Preference persistence across page reloads (interval, range, chart type, drawer)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForResponse((res) => res.url().includes('/history') && res.status() === 200, { timeout: 30000 });

    // Switch interval to 'W'
    const intW = page.locator('.interval-btn[data-interval="W"]');
    await intW.click();
    await expect(intW).toHaveClass(/active/);

    // Switch range to '5Y'
    const range5Y = page.locator('.range-btn[data-range="5Y"]');
    await range5Y.click();
    await expect(range5Y).toHaveClass(/active/);

    // Switch chart type to 'line'
    const railChartType = page.locator('#tv-rail-chart-type');
    await railChartType.click(); // candles -> line
    await expect(railChartType).toHaveAttribute('data-type', 'line');

    // Reload page to test persistence
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForResponse((res) => res.url().includes('/history') && res.status() === 200, { timeout: 30000 });

    // Assert that 'W', '5Y', and 'line' were restored from localStorage!
    await expect(page.locator('.interval-btn[data-interval="W"]')).toHaveClass(/active/);
    await expect(page.locator('.range-btn[data-range="5Y"]')).toHaveClass(/active/);
    await expect(page.locator('#tv-rail-chart-type')).toHaveAttribute('data-type', 'line');

    // Test watchlist empty state & quick-add suggestion
    await page.locator('#watchlist-drawer-toggle').click();
    await page.evaluate(() => {
      if (window.apexWatchlist) {
        window.apexWatchlist.clear();
      }
    });
    const suggBtn = page.locator('.wl-add-sugg-btn[data-add="TCS.NS"]');
    await expect(suggBtn).toBeVisible({ timeout: 5000 });
    await suggBtn.click();
    await expect(page.locator('.wl-item-row[data-symbol="TCS.NS"]')).toBeVisible({ timeout: 5000 });

    expect(failedUrls).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
