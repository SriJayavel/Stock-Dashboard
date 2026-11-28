import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('shares a paginated international stock directory between Markets and Discover', async ({ page }, testInfo) => {
  const apiCalls = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url());
  });
  await page.goto('/?freeze=1#/markets');
  await page.getByRole('button', { name: 'Browse stocks' }).click();
  const markets = page.locator('#market-stock-directory');
  await expect(markets.getByRole('heading', { name: 'Listed stocks' })).toBeFocused();
  const rows = markets.locator('tr[data-stock-symbol]');
  const status = markets.locator('[data-listing-status]');
  await expect(status).toHaveText(/1–25 of [\d,]+ listings/);
  const count = Number((await status.textContent()).split(' of ')[1].replace(/[^0-9]/g, ''));
  expect(count).toBeGreaterThan(10000);
  await expect(rows).toHaveCount(25);
  const firstSymbol = await rows.first().getAttribute('data-stock-symbol');
  await markets.getByRole('button', { name: 'Next' }).click();
  await expect(status).toHaveText(/26–50 of/);
  await expect(rows.first()).not.toHaveAttribute('data-stock-symbol', firstSymbol);
  await markets.getByRole('combobox', { name: 'Listing market' }).selectOption('JP');
  await page.screenshot({ path: testInfo.outputPath('markets-stock-directory.png') });
  await markets.getByRole('searchbox', { name: 'Search listed stocks' }).fill('Nintendo');
  await expect(rows.first()).toHaveAttribute('data-stock-symbol', '7974.T');
  await expect(rows.first()).toContainText('Tokyo Stock Exchange');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Discover', exact: true }).click();
  await expect(page).toHaveURL(/#\/discover$/);
  const discover = page.locator('#discover-stock-directory');
  await expect(discover).toBeVisible();
  await expect(discover.locator('[data-listing-status]')).toHaveText(/1–25 of/);
  await discover.getByRole('combobox', { name: 'Listing market' }).selectOption('IN');
  await discover.getByRole('searchbox', { name: 'Search listed stocks' }).fill('TCS.NS');
  const result = discover.locator('tr[data-stock-symbol="TCS.NS"]');
  await expect(result).toContainText('Quote not loaded');
  await discover.getByRole('button', { name: 'Load demo quotes' }).click();
  await expect(result).toContainText('Synthetic quote');
  await expect(result.locator('.provenance-trigger')).toHaveAttribute('aria-description', /TCS\.NS last price.*synthetic/i);
  await expect(result).toHaveCSS('display', 'grid');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('discover-stock-directory-mobile.png') });
  await result.getByRole('link', { name: 'TCS.NS', exact: true }).click();
  await expect(page).toHaveURL(/#\/symbol\/TCS\.NS\/chart$/);
  expect(apiCalls).toEqual([]);
});

test('finds newly listed stocks in global search beyond the original stock presets', async ({ page }) => {
  await page.goto('/?freeze=1#/discover');
  const search = page.locator('#global-search-input');
  await search.fill('ADBE');
  await expect(page.getByRole('option', { name: /ADBE.*Adobe/i })).toBeVisible();
  const directory = page.locator('#discover-stock-directory');
  await directory.getByRole('combobox', { name: 'Listing market' }).selectOption('TW');
  await directory.getByRole('searchbox', { name: 'Search listed stocks' }).fill('2303.TW');
  const row = directory.locator('tr[data-stock-symbol="2303.TW"]');
  await expect(row).toContainText('TWSE');
  await expect(row).toContainText('Listing only');
  await expect(directory.getByRole('button', { name: 'Load demo quotes' })).toBeDisabled();
});

test('Discover sorts raw prices and exports the same assets shown by its applied rules', async ({ page }) => {
  await page.goto('/?freeze=1#/discover/indian_leaders');
  const rows = page.locator('#screener-table-body tr');
  const status = page.locator('#discover-results');
  await expect(status).toHaveText('5 of 5 assets');
  await expect(page.locator('#discover-source')).toHaveText('Synthetic demo');
  const priceSort = page.getByRole('columnheader', { name: 'Price', exact: true }).getByRole('button');
  await priceSort.press('Enter');
  await expect(priceSort).toBeFocused();
  await expect(priceSort.locator('..')).toHaveAttribute('aria-sort', 'ascending');
  await expect(rows.first()).toHaveAttribute('data-symbol', 'ICICIBANK.NS');
  await priceSort.press('Enter');
  await expect(rows.first()).toHaveAttribute('data-symbol', 'TCS.NS');
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  const rules = page.getByRole('form', { name: 'Screening rules' });
  await rules.getByLabel('Metric for condition 1').selectOption('current_price');
  await rules.getByLabel('Operator for condition 1').selectOption('>');
  await rules.getByLabel('Threshold for condition 1').fill('3000');
  await rules.getByRole('button', { name: 'Apply rules' }).click();
  await expect(rows).toHaveCount(1);
  await expect(status).toHaveText('1 of 5 assets');
  await rules.getByRole('button', { name: 'Add condition' }).click();
  await rules.getByLabel('Match logic').selectOption('OR');
  await rules.getByRole('button', { name: 'Apply rules' }).click();
  await expect(status).toHaveText('3 of 5 assets');
  await rules.getByLabel('Threshold for condition 1').fill('5000');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const data = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(data.map(item => item.symbol)).toEqual(['TCS.NS', 'INFY.NS', 'ICICIBANK.NS']);
  expect(data.every(item => item.data_source === 'Synthetic demo')).toBe(true);
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const csv = await readFile(await (await csvDownload).path(), 'utf8');
  expect(csv.split('\n').slice(1).map(line => line.split(',')[0])).toEqual(['"TCS.NS"', '"INFY.NS"', '"ICICIBANK.NS"']);
  await page.getByRole('searchbox', { name: 'Find in universe' }).fill('missing symbol');
  await expect(page.getByText('No assets match your filters')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  await page.locator('#discover-state').getByRole('button', { name: 'Clear filters' }).click();
  await expect(status).toHaveText('5 of 5 assets');
  await page.getByRole('button', { name: 'Create alert for INFY.NS' }).click();
  await expect(page).toHaveURL(/#\/monitor\/alerts$/);
  await expect(page.locator('#ws-alert-sym-input')).toHaveValue('INFY.NS');
});

test('Discover recovers from a failed snapshot and stays usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/demo/screener.json', route => route.fulfill({ status: 503 }), { times: 1 });
  await page.goto('/?freeze=1#/discover/indian_leaders');
  await expect(page.getByText('Unable to load this universe')).toBeVisible();
  await page.getByRole('button', { name: 'Retry snapshot' }).click();
  await expect(page.locator('#discover-results')).toHaveText('5 of 5 assets');
  const universes = page.getByRole('navigation', { name: 'Asset universes' });
  await expect(universes.getByRole('link', { name: 'Forex' })).toBeInViewport();
  await universes.getByRole('link', { name: 'US Mega-Caps' }).click();
  await expect(page.locator('#screener-table-body tr[data-symbol="AAPL"]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#discover-results')).toHaveText('5 of 5 assets');
  await universes.getByRole('link', { name: 'Forex' }).click();
  const fxRow = page.locator('#screener-table-body tr[data-symbol="USDINR=X"]');
  await expect(fxRow).toContainText('₹83.2909');
  await expect(fxRow).toContainText('Snapshot only');
  await page.goBack();
  await expect(page.locator('#discover-results')).toHaveText('5 of 5 assets');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByLabel('Price move').selectOption('up');
  await page.locator('#discover-snapshot-panel').getByLabel('Sort by').selectOption('price:descending');
  const rows = page.locator('#screener-table-body tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-symbol', 'INFY.NS');
  await page.getByRole('link', { name: 'Open INFY.NS chart' }).click();
  await expect(page).toHaveURL(/#\/symbol\/INFY\.NS\/chart$/);
});

test('finds TradingView indicator aliases and restores new studies on reload', async ({ page }) => {
  await page.goto('/?freeze=1#/symbol/TCS.NS/chart');
  await expect(page.locator('#tv-chart-container')).toHaveAccessibleName(/Last close/);
  await page.getByRole('button', { name: /^Indicators/ }).click();
  const picker = page.locator('#tv-indicator-picker-modal');
  const search = picker.getByRole('searchbox', { name: 'Search indicators' });
  await search.fill('Linear Regression Curve');
  await expect(picker.getByRole('status')).toHaveText('1 matching study');
  await expect(picker.locator('[data-ind-id="lsma"]')).toContainText('Least Squares Moving Average');
  await picker.locator('[data-add-id="lsma"]').click();
  await search.fill('Fisher Transform');
  await picker.locator('[data-add-id="fisher_transform"]').click();
  await page.locator('#close-indicator-picker-btn').click();
  await expect(page.locator('#tv-legend-indicators')).toContainText(/LSMA\s+\d/);
  await expect(page.locator('.tv-subpane-header').filter({ hasText: 'Fisher Transform' })).toContainText('Trigger');
  await page.reload();
  await expect(page.locator('#tv-legend-indicators')).toContainText(/LSMA\s+\d/);
  await expect(page.locator('.tv-subpane-header').filter({ hasText: 'Fisher Transform' })).toBeVisible();
});

test('draws, manages, compares and exports from the fullscreen chart', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?freeze=1#/symbol/TCS.NS/chart');
  const chartContainer = page.locator('#tv-chart-container');
  await expect(chartContainer).toHaveAccessibleName(/Last close/);
  const canvas = chartContainer.locator('canvas');
  const fullscreen = page.getByRole('button', { name: 'Toggle Fullscreen' });
  const toolbar = page.getByRole('toolbar', { name: 'Fullscreen chart tools' });
  await expect(toolbar).toBeHidden();
  await fullscreen.click();
  await expect(toolbar).toBeVisible();
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
  const panelBounds = await page.locator('#panel-chart').boundingBox();
  expect(panelBounds).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 });
  const plotBounds = await page.evaluate(() => {
    const chart = window.apexChartInstance;
    return { top: chart.plot.top, legendEnd: chart.cornerLegend.offsetTop + chart.cornerLegend.offsetHeight };
  });
  expect(plotBounds.top).toBeGreaterThan(plotBounds.legendEnd);
  await page.getByRole('button', { name: 'Draw price level' }).click();
  await expect(canvas).toBeFocused();
  await canvas.press('Enter');
  const fib = toolbar.getByRole('button', { name: 'Fibonacci' });
  await fib.focus();
  await fib.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: 'Ray' })).toBeFocused();
  await fib.click();
  for (let i = 0; i < 35; i++) await canvas.press('ArrowLeft');
  await canvas.press('Enter');
  for (let i = 0; i < 20; i++) await canvas.press('ArrowRight');
  await canvas.press('Enter');
  await expect(page.locator('#chart-drawing-hint')).toHaveText('Fibonacci retracement added.');
  await toolbar.getByRole('button', { name: 'Undo drawing' }).click();
  await expect(page.locator('#chart-drawing-hint')).toHaveText('Drawing undone.');
  await toolbar.getByRole('button', { name: 'Redo drawing' }).click();
  await expect(page.locator('#chart-drawing-hint')).toHaveText('Drawing restored.');
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  const tools = page.locator('#chart-tools-panel');
  await expect(tools).toContainText('Price level 1');
  await expect(tools).toContainText('Fibonacci retracement 2');
  await tools.getByRole('button', { name: 'Context' }).click();
  await expect(tools).toContainText('Synthetic demo');
  await page.getByRole('button', { name: 'Compare', exact: true }).first().click();
  await tools.getByLabel('Comparison symbol').fill('INFY.NS');
  await tools.getByRole('button', { name: 'Apply comparison' }).click();
  await expect(tools.getByRole('status')).toContainText('first shared visible close');
  await expect(page.locator('#tv-scale-log-btn')).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('group', { name: 'Chart range' }).getByRole('button', { name: '6M', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.apexChartInstance.tools.context)).toMatch(/:6m$/i);
  await expect(tools.getByRole('status')).toContainText('first shared visible close');
  await expect(tools.getByLabel('Comparison symbol')).toHaveValue('INFY.NS');
  await tools.getByRole('button', { name: 'Remove comparison' }).click();
  await expect(page.locator('#tv-scale-log-btn')).toHaveAttribute('aria-disabled', 'false');
  await page.keyboard.press('Escape');
  await expect(tools).toBeHidden();
  await expect(toolbar).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await toolbar.getByRole('button', { name: 'Export PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^MARA-TCS\.NS-.+\.png$/);
  expect(await download.failure()).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('fullscreen.png') });
  await page.keyboard.press('Escape');
  await expect(toolbar).toBeHidden();
  await page.reload();
  await expect(chartContainer).toHaveAccessibleName(/Last close/);
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(tools).toContainText('Fibonacci retracement 2');
  await tools.getByRole('button', { name: /Remove Fibonacci/ }).click();
  await expect(tools).not.toContainText('Fibonacci retracement');
  expect(errors).toEqual([]);
});

test('keeps search focused while Markets finishes loading', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/demo/sectors.json', async route => {
    await pending;
    await route.continue();
  });
  await page.goto('/?freeze=1#/markets');
  const search = page.locator('#global-search-input');
  await search.fill('>watchlist');
  release();
  const sector = page.locator('#sector-intelligence-grid').getByRole('gridcell', { name: /Technology/ });
  await expect(sector).toBeVisible();
  await expect(search).toBeFocused();
  await expect(page.getByRole('option', { name: 'Watchlist' })).toBeVisible();
});

test('opens the Watchlist as a mobile overlay and restores focus on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?freeze=1#/markets');
  await expect(page.locator('#tab-all')).toBeFocused();
  const trigger = page.locator('#watchlist-drawer-toggle');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Watchlist and alerts' });
  const close = dialog.getByRole('button', { name: 'Close watchlist drawer' });
  await expect(close).toBeFocused();
  await expect(page.locator('#mara-app')).toHaveAttribute('inert', '');
  await expect(page.locator('#drawer-asset-telemetry')).toBeHidden();
  await close.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('filters constituents and lets keyboard users activate Analyze', async ({ page }) => {
  await page.goto('/?freeze=1#/markets');
  await page.locator('#sector-intelligence-grid').getByRole('gridcell', { name: /Technology/ }).click();
  const filter = page.getByLabel('Filter Constituents');
  const status = page.locator('#sector-filter-status');
  await filter.fill('missing-symbol');
  await expect(status).toContainText('No matching symbols');
  await filter.fill('AAPL');
  await expect(status).toHaveText('1 of 4 constituents');
  await page.getByRole('button', { name: 'Analyze AAPL' }).press('Enter');
  await expect(page).toHaveURL(/\/symbol\/AAPL\/chart$/);
});

test('backtest trace cancels when leaving Research and completes with fixture provenance', async ({ page }) => {
  let holdHistory = true;
  let releaseHistory;
  const historyGate = new Promise(resolve => { releaseHistory = resolve; });
  await page.route('**/demo/candles-TCS-NS.json', async route => {
    if (holdHistory) await historyGate;
    await route.continue();
  });
  await page.goto('/?freeze=1#/research/TCS.NS/lab');
  const button = page.getByRole('button', { name: 'Run Backtest' });
  const status = page.locator('#backtest-run-state');
  await button.click();
  await expect(status).toContainText('Fetching daily history');
  await page.evaluate(() => { location.hash = '/markets'; });
  await expect(status).toHaveText('TCS.NS · Cancelled');
  holdHistory = false;
  releaseHistory();
  await page.evaluate(() => { location.hash = '/research/TCS.NS/lab'; });
  await expect(status).toHaveText('TCS.NS · Cancelled');
  await button.click();
  await expect(status).toHaveText('TCS.NS · Completed');
  await expect(page.locator('.backtest-source')).toContainText('Demo · Synthetic fixture');
  await expect(page.locator('#backtest-trace details[open]')).toHaveCount(0);
  await page.locator('#backtest-trace summary').filter({ hasText: 'Prepared simulation parameters' }).click();
  await expect(page.locator('#backtest-trace details[open] pre')).toContainText('TCS.NS');
});

test('adds advanced studies, saves an anchored VWAP date and restores them on reload', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?freeze=1#/symbol/TCS.NS/chart');
  await expect(page.locator('#tv-chart-container')).toHaveAccessibleName(/Last close/);
  const response = await page.request.get('/demo/candles-TCS-NS.json');
  const { candles } = await response.json();
  const anchorDate = new Date(candles.at(-12).time * 1000).toISOString().slice(0, 10);
  await page.getByRole('button', { name: /^Indicators/ }).click();
  await page.getByRole('button', { name: 'Advanced' }).click();
  const library = page.locator('#tv-indicator-list');
  for (const id of ['anchored_vwap', 'ppo', 'volatility_squeeze']) {
    await library.locator(`[data-add-id="${id}"]`).click();
  }
  await page.getByRole('button', { name: /^Active \(/ }).click();
  await library.locator('.tv-ind-card').filter({ hasText: 'Anchored VWAP' }).getByRole('button', { name: 'Parameters' }).click();
  const anchor = page.getByLabel('Anchor date (UTC)');
  await expect(anchor).toBeFocused();
  await anchor.fill(anchorDate);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(library.locator('.tv-ind-card').filter({ hasText: 'Anchored VWAP' })).toContainText(anchorDate);
  await page.locator('#close-indicator-picker-btn').click();
  await expect(page.locator('#tv-legend-indicators')).toContainText(/AVWAP \d/);
  const ppo = page.locator('.tv-subpane-header').filter({ hasText: 'Percentage Price Oscillator' });
  const squeeze = page.locator('.tv-subpane-header').filter({ hasText: 'Volatility Squeeze' });
  await expect(ppo.locator('.pane-hdr-value')).toContainText(/PPO .*%/);
  await expect(squeeze.locator('.pane-hdr-value')).toContainText(/Compression: (Inside|Outside) channel/);
  await page.reload();
  await expect(page.locator('#tv-legend-indicators')).toContainText(/AVWAP \d/);
  await expect(ppo.locator('.pane-hdr-value')).toContainText(/PPO .*%/);
  await expect(squeeze.locator('.pane-hdr-value')).toContainText(/Compression/);
  expect(errors).toEqual([]);
});

test.describe('Markets and chart interactions', () => {
  test('sorts benchmarks and opens a chart from the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/?freeze=1#/markets');
    const rows = page.locator('#markets-indices-table .benchmark-row');
    await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(8);
    const sixth = await rows.nth(5).boundingBox();
    expect(sixth.y + sixth.height).toBeLessThanOrEqual(768);
    const paths = await rows.locator('polyline').evaluateAll(nodes => nodes.map(node => node.getAttribute('points')));
    expect(paths).toHaveLength(await rows.count());
    expect(new Set(paths).size).toBe(paths.length);
    const before = await rows.evaluateAll(nodes => nodes.map(row => row.dataset.sym));
    const header = page.getByRole('table', { name: 'Global benchmarks' }).getByRole('columnheader', { name: 'Last Price' });
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

  test('keeps the chart canvas sharp on touch and resize', async ({ browser, baseURL }, testInfo) => {
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
      await page.getByRole('button', { name: 'Toggle Fullscreen' }).tap();
      await expect.poll(() => canvas.evaluate(node => node.width / node.clientWidth)).toBeCloseTo(2);
      const toolbar = page.getByRole('toolbar', { name: 'Fullscreen chart tools' });
      await toolbar.getByRole('button', { name: 'Time marker' }).tap();
      const plotCenter = await canvas.evaluate(node => {
        const { plot } = window.apexChartInstance;
        const bounds = node.getBoundingClientRect();
        return { x: bounds.left + (plot.left + plot.right) / 2, y: bounds.top + (plot.top + plot.bottom) / 2 };
      });
      await page.touchscreen.tap(plotCenter.x, plotCenter.y);
      await expect(page.locator('#chart-drawing-hint')).toHaveText('Time marker added.');
      await expect(page.locator('#panel-chart')).toBeInViewport({ ratio: .99 });
      await expect(page.locator('#tv-bb-age')).toBeInViewport({ ratio: .99 });
      await expect(page.locator('#tv-reset-view-btn')).toBeInViewport({ ratio: .99 });
      await page.screenshot({ path: testInfo.outputPath('fullscreen-mobile.png') });
    } finally {
      await page.close();
    }
  });

  test('stacks benchmark rows on phones and persists the selected theme', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?freeze=1#/markets');
    const table = page.getByRole('region', { name: 'Global benchmarks' });
    await expect(table.locator('.benchmark-row').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect(table.locator('.benchmark-row').first()).toHaveCSS('display', 'grid');
    await expect(page.getByRole('tablist', { name: 'Workspaces' })).toHaveCSS('position', 'fixed');
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
  await expect(page.locator('.market-ticker-item').first()).toBeVisible();
  await expect(page.locator('.tape-item')).toHaveCount(0);
  const prices = await readPrices();
  await expect.poll(readPrices).not.toEqual(prices);
  const mismatches = await page.locator('.market-ticker-item').evaluateAll(items => items.filter(item => {
    const symbol = CSS.escape(item.dataset.symbol);
    const row = document.querySelector(`#markets-indices-table [data-sym="${symbol}"]`);
    const price = row?.querySelector('.col-price .provenance-value') || row?.querySelector('.col-price');
    return price && item.querySelector('.market-ticker-value').textContent.trim() !== price.textContent.trim();
  }).length);
  expect(mismatches).toBe(0);
  expect(await first.evaluate(node => node.isConnected)).toBe(true);
  const toggle = page.getByRole('button', { name: 'Pause updates' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const paused = await readPrices();
  // A full tick interval must pass with the simulation paused.
  await page.waitForTimeout(2100);
  expect(await readPrices()).toEqual(paused);
});

test('opens quote provenance with mouse and keyboard and persists table settings', async ({ page }) => {
    await page.goto('/?freeze=1#/markets');
    const quote = page.locator('#markets-indices-table .col-price .provenance-trigger').first();
    const provenance = page.locator('#provenance-card');
    await quote.hover();
    await expect(provenance).toContainText('Source data');
    await page.keyboard.press('Escape');
    await expect(provenance).toBeHidden();
    await quote.press('Enter');
    await expect(provenance).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/markets$/);
    await page.getByRole('button', { name: 'Comfortable rows' }).click();
    await expect(page.getByRole('button', { name: 'Comfortable rows' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.benchmark-columns summary').click();
    await page.locator('.benchmark-columns input[value="symbol"]').check();
    await page.locator('.benchmark-columns input[value="symbol"]').uncheck();
    const symbolColumn = page.locator('#markets-indices-table th.col-symbol');
    await expect(symbolColumn).toBeHidden();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Comfortable rows' })).toHaveAttribute('aria-pressed', 'true');
    await expect(symbolColumn).toBeHidden();
});

test('opens quote provenance on touch', async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    await page.goto('/?freeze=1#/markets');
    await page.locator('#markets-indices-table .col-price .provenance-trigger').first().tap({ timeout: 10000 });
    await expect(page.locator('#provenance-card')).toContainText('synthetic market fixture');
    await expect(page).toHaveURL(/#\/markets$/);
  } finally {
    await page.close();
  }
});

test('opens the index pair from the command search', async ({ page }) => {
  await page.goto('/?freeze=1#/markets');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Search symbols, companies or actions' });
  await search.fill('> nifty');
  await page.getByRole('option', { name: /Open Compare with NIFTY and SENSEX/ }).click();
  await expect(page).toHaveURL(/compare\/benchmarks\/nifty-sensex$/);
  await expect(page.getByRole('table', { name: 'NIFTY 50 and SENSEX' }).getByRole('rowheader')).toHaveText(['NIFTY 50', 'SENSEX']);
});

test('compares common sessions and scrubs the shared history on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?freeze=1#/markets');
  await page.getByRole('link', { name: 'Compare NIFTY and SENSEX' }).click();
  const comparison = page.locator('#compare-benchmark-pair');
  const slider = comparison.getByRole('slider', { name: 'Inspect session' });
  await expect(slider).toBeVisible();
  await expect(comparison.locator('#pair-source')).toContainText('Synthetic demo closes · 63 shared sessions');
  await expect(page.getByRole('heading', { name: 'Compare assets' })).toBeHidden();
  await comparison.getByRole('button', { name: '21 sessions' }).click();
  await expect(slider).toHaveAttribute('max', '20');
  const latest = await slider.getAttribute('aria-valuetext');
  await slider.press('ArrowLeft');
  await expect(slider).not.toHaveAttribute('aria-valuetext', latest);
  await slider.press('Home');
  await expect(comparison.locator('#pair-gap')).toHaveText('Returns are even');
  await comparison.getByText('View session data', { exact: true }).click();
  await expect(comparison.locator('#pair-history-rows tr')).toHaveCount(21);
  await expect(comparison.locator('#pair-history-rows tr').first()).toContainText('0.00%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await comparison.getByRole('link', { name: 'Global benchmarks' }).click();
  await expect(page).toHaveURL(/#\/markets$/);
});

test('opens symbol-specific research from the command search', async ({ page }) => {
  await page.goto('/?freeze=1#/markets');
  await expect(page.locator('#tab-all')).toBeFocused();
  await page.keyboard.press('Control+k');
  const search = page.locator('#global-search-input');
  await expect(search).toBeFocused();
  await search.fill('>AAPL scenarios');
  await page.getByRole('option', { name: /AAPL.*scenarios/i }).click();
  await expect(page).toHaveURL(/\/research\/AAPL\/lab$/);
  await expect(page.getByRole('tabpanel', { name: 'Scenarios' })).toBeVisible();
});

test('searches global company names and opens the correct exchange listing offline', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
  });
  await page.goto('/?freeze=1#/markets');
  await expect(page.locator('#tab-all')).toBeFocused();
  const search = page.getByRole('combobox', { name: 'Search symbols, companies or actions' });
  await search.fill('ASML');
  await expect(page.getByRole('option', { name: /ASML Holding.*NASDAQ.*USD/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /ASML\.AS.*Euronext Amsterdam.*EUR/ })).toBeVisible();
  await search.fill('トヨタ');
  await expect(page.getByRole('option', { name: /7203\.T.*Toyota Motor.*JPY/ })).toBeVisible();
  await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(page).toHaveURL(/#\/markets$/);
  await search.press('Enter');
  await expect(page).toHaveURL(/#\/symbol\/7203\.T\/chart$/);
  await expect(page.locator('#tv-chart-container')).toHaveAccessibleName(/7203\.T.*Last close ¥/);
  await expect(page.locator('#tv-data-badge')).toHaveText('SYNTHETIC');
  expect(requests).toEqual([]);
});

test('opens populated company research and keeps News and Earnings reachable', async ({ page }) => {
  await page.goto('/?freeze=1#/markets');
  await page.getByRole('tab', { name: 'Research', exact: true }).click();
  const sections = page.getByRole('tablist', { name: 'Research sections' });
  const overview = sections.getByRole('tab', { name: 'Overview' });
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Tata Consultancy Services' })).toBeVisible();
  await expect(page.locator('#research-facts')).toContainText('Market cap');
  await expect(page.locator('#research-latest-quarter')).toContainText('Q3 2024');
  await overview.press('ArrowRight');
  await expect(sections.getByRole('tab', { name: 'News' })).toBeFocused();
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  const news = page.getByRole('tabpanel', { name: 'News' });
  await expect(news).toContainText('Archived research');
  await expect(news.getByRole('heading', { name: 'Archived company disclosures' })).toBeVisible();
  await expect(news.getByRole('heading', { name: 'Sector / Market context' })).toBeVisible();
  await expect(news.getByRole('link', { name: /acquisition of BBY/ })).toHaveAttribute('href', /tcs\.com/);
  await news.getByRole('button', { name: 'Deals', exact: true }).click();
  await expect(news.getByRole('link', { name: /acquisition of BBY/ })).toBeVisible();
  await expect(news.getByRole('heading', { name: 'Sector / Market context' })).toBeHidden();
  await news.getByRole('button', { name: 'Earnings', exact: true }).click();
  await expect(news.getByRole('link', { name: /files September-quarter results/ })).toBeVisible();
  await expect(news.getByRole('heading', { name: 'Sector / Market context' })).toBeVisible();
  await news.getByRole('link', { name: 'Earnings' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Earnings' })).toContainText('100,000');
  await expect(page.getByRole('tabpanel', { name: 'Earnings' })).toContainText('Final dividend');
  for (const [symbol, company] of [['AAPL', 'Apple'], ['HSBA.L', 'HSBC']]) {
    await page.goto(`/?freeze=1#/research/${symbol}/news`);
    const sources = page.getByRole('region', { name: 'Research sources' });
    const headlines = sources.getByRole('link', { name: 'Company headlines' });
    await expect.poll(async () => new URL(await headlines.getAttribute('href')).searchParams.get('q')).toContain(company);
    await expect(sources.getByRole('link', { name: 'Filings and investor relations' })).toBeVisible();
    await expect(sources.getByRole('link', { name: 'Sector / Market headlines' })).toBeVisible();
    await expect(page.locator('#panel-news')).not.toContainText('BBY Services');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?freeze=1#/research/TCS.NS/overview');
  await expect(page.getByRole('heading', { name: 'Tata Consultancy Services' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await overview.press('End');
  await expect(sections.getByRole('tab', { name: 'Report' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#report-rendered-preview')).toContainText('Research Dossier: TCS.NS');
});

const workspaces = {
  markets: '/markets',
  discover: '/discover',
  analyze: '/symbol/TCS.NS/chart',
  compare: '/compare/TCS.NS',
  research: '/research/TCS.NS/overview',
  monitor: '/monitor',
};

for (const [workspace, path] of Object.entries(workspaces)) {
  for (const theme of ['dark', 'light']) {
    test(`${workspace} meets automated accessibility checks in ${theme} mode`, async ({ page }) => {
      await page.addInitScript(theme => localStorage.setItem('mara-theme', theme), theme);
      await page.goto(`/?freeze=1#${path}`);
      await expect(page.locator(`#workspace-${workspace}`)).toBeVisible();
      if (workspace === 'markets') await expect(page.locator('.benchmark-row').first()).toBeVisible();
      if (workspace === 'analyze') await expect(page.locator('#tv-chart-container')).toHaveAccessibleName(/Last close/);
      if (workspace === 'compare') await expect(page.locator('.correlation-table:not(.skeleton-table) tbody tr').first()).toBeVisible();
      if (workspace === 'research') await expect(page.locator('#research-latest-quarter')).toContainText('Q3 2024');
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const serious = violations.filter(({ impact }) => ['serious', 'critical'].includes(impact));
      expect(serious.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }))).toEqual([]);
    });
  }
}

/**
 * MARA Phase 3.1 — Static Vercel Demo Deployment Verification
 *
 * Validates the demo build (npm run build:demo) end-to-end:
 *   - All 6 workspace interfaces load with synthetic data
 *   - Zero network calls to /api/* or Supabase
 *   - Header displays the MARA wordmark without an environment badge
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

    await expect(page.locator('#demo-environment')).toHaveCount(0);
    await expect(page.locator('#demo-banner, #ticker-tape-track')).toHaveCount(0);

    const sectors = page.locator('#sector-intelligence-grid');
    await expect(sectors).toBeVisible();
    const tech = sectors.getByRole('gridcell', { name: /Technology/ });
    await expect(sectors.getByRole('gridcell')).toHaveCount(2);
    await expect(tech).toContainText('+1.20%');
    await tech.click();
    const detail = page.locator('#sector-detail-body');
    await expect(detail.getByText('TCS.NS', { exact: true })).toBeVisible();
    await tech.press('ArrowRight');
    await expect(page.locator('#sector-detail-title')).toHaveText('Financial Services Constituents');
    await expect(detail.getByText('HDFCBANK.NS', { exact: true })).toBeVisible();
    await expect(detail.getByRole('columnheader', { name: 'Weight' })).toHaveCount(0);
    const fx = page.locator('#markets-macro-forex-list');
    await expect(fx).toBeVisible();
    await expect(fx.locator('.macro-asset-freshness').first()).toContainText('IST');

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

    await expect.poll(() => page.evaluate(() => {
      const indicators = document.getElementById('tv-indicators-menu-btn').getBoundingClientRect();
      const events = document.getElementById('tv-toggle-events-btn').getBoundingClientRect();
      return events.left - indicators.right;
    })).toBeGreaterThanOrEqual(4);

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
