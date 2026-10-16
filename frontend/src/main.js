/**
 * Mara - Frontend Controller
 * Reactive orchestration of Lightweight Charts, valuation matrices,
 * multi-asset macro categories, persistent watchlist, and resilient API handling.
 */

import { api } from './api.js';
import { TerminalChart } from './chart.js';
import { watchlist } from './watchlist.js';
import { alertsManager } from './alerts.js';
import { ResearchNotebook } from './notebook.js';
import { ResearchReportGenerator } from './report_generator.js';
import { screenerBuilder, SCREENER_METRICS } from './screener_builder.js';
import { Backtester } from './backtester.js';
import {
  INDICATOR_REGISTRY,
  getAllIndicators,
  getIndicatorsByGroup,
  getIndicatorDefinition,
  hasValidVolume,
} from './indicators.js';
import { router } from './router.js';
import { auth, getAuthToken } from './auth.js';

let chartInstance = null;
let currentSymbol = null;
let currentTimeframe = '1y';
let currentActiveWorkspace = 'analyze';
let currentAnalyzeTab = 'chart';
let currentResearchTab = 'news';
let currentMonitorTab = 'watchlist';
let currentActiveTab = 'chart';
let currentMacroCategory = 'Indices';
let marketDataCache = null;
let currentResearchData = null;
let currentDeepResearchData = null;
let currentV4Data = null;
let currentCandles = [];
let showChartEvents = true;
let activeCorrelationPeriod = '1y';
let currentScreenerAssets = [];
let currentOverviewData = null;
let searchRequestSeq = 0;
let lastMarketOverviewFetchTime = 0;

// Rapid ticker switching race condition guard
let currentLoadToken = 0;
let currentChartInterval = (() => {
  try {
    return localStorage.getItem(getAccountStorageKey('apex_chart_interval')) || '1m';
  } catch {
    return '1m';
  }
})();
let currentChartRange = (() => {
  try {
    return localStorage.getItem(getAccountStorageKey('apex_chart_range')) || '1d';
  } catch {
    return '1d';
  }
})();
let currentMarketStatus = 'CLOSED';
let currentMarketSession = 'CLOSED';
let currentDataFreshness = 'CACHED';
let lastDataArrivalTimestamp = 0;
let lastServerDataTimestamp = null;
let lastKnownDataSource = 'Yahoo Finance';
let lastKnownExchange = 'NSE';
let lastKnownTimezone = 'Asia/Kolkata';
let staleCheckTimer = null;

// Wait for valid auth token before making API requests
async function waitForAuthToken() {
  // Wait up to 5 seconds for a token to become available
  for (let i = 0; i < 50; i++) { // 50 * 100ms = 5 seconds
    const token = getAuthToken();
    if (token !== null && token !== undefined && token !== '') {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // If we get here, we timed out - but we'll proceed anyway to avoid hanging
  console.warn('Timed out waiting for auth token, proceeding anyway');
}

// Load Stock Header & Valuation & Chart with Race Condition Token
async function loadStock(symbol, timeframe = '1y') {
  // Wait for valid auth token before making any API requests
  await waitForAuthToken();

  const token = ++currentLoadToken;
  currentSymbol = symbol;
  currentTimeframe = timeframe;
  updateStarBtn();

  const alertSym = document.getElementById('alert-form-symbol');
  if (alertSym) alertSym.textContent = symbol;

  // Immediately update symbol button and corner legend to eliminate stale data ghosting
  const tvSymText = document.getElementById('tv-tb-symbol');
  if (tvSymText) tvSymText.textContent = symbol;
  const tvNameText = document.getElementById('tv-tb-name');
  if (tvNameText) tvNameText.textContent = 'Loading...';
  const tvLegSym = document.getElementById('tv-leg-sym');
  if (tvLegSym) tvLegSym.textContent = symbol;
  const activeInt = currentChartInterval || chartInstance?.activeInterval || '1m';
  const intLabel = (activeInt === '1d' || activeInt === 'D') ? '1D' : ((activeInt === '1wk' || activeInt === 'W') ? '1W' : ((activeInt === '1mo' || activeInt === 'M') ? '1M' : activeInt.toUpperCase()));
  const tvLegInterval = document.getElementById('tv-leg-interval');
  if (tvLegInterval) tvLegInterval.textContent = intLabel;

  // Update range legend
  const activeRange = currentChartRange || chartInstance?.activeRange || '1d';
  let rangeLabel;
  if (activeRange === '1d') rangeLabel = '1D';
  else if (activeRange === '5d') rangeLabel = '5D';
  else if (activeRange === '1mo') rangeLabel = '1M';
  else if (activeRange === '3mo') rangeLabel = '3M';
  else if (activeRange === '6mo') rangeLabel = '6M';
  else if (activeRange === '1y') rangeLabel = '1Y';
  else if (activeRange === '2y') rangeLabel = '2Y';
  else if (activeRange === '5y') rangeLabel = '5Y';
  else if (activeRange === 'all') rangeLabel = 'All';
  else rangeLabel = activeRange.toUpperCase();

  const tvLegRange = document.getElementById('tv-leg-range');
  if (tvLegRange) tvLegRange.textContent = rangeLabel;

  if (chartInstance) {
    chartInstance.resetCornerLegend(symbol, intLabel);
  }

  try {
    // 1 & 2. Fetch Overview Fundamentals and Chart History in parallel
    const overviewPromise = api.getStockOverview(symbol);
    const chartPromise = loadStockChart(symbol, token, activeInt, currentChartRange);

    const overview = await overviewPromise;
    if (token !== currentLoadToken) return; // Discard stale click response
    currentOverviewData = overview;
    renderStockOverview(overview);

    await chartPromise;

    // 3. Fetch Research Core Dossier & Multi-Year Statements
    loadStockResearch(symbol, token);

    // 4. Fetch Deep Research Bundle
    loadStockDeepResearch(symbol, token, overview);

    // 5. Fetch Mara v4 Intelligence (What Changed, Anomalies, Relationships, Statement Quality, Filing Diff)
    loadStockV4Intelligence(symbol, token);

    // 6. Fetch Macro Explorer correlations
    loadAndRenderMacroExplorer(symbol);
  } catch (err) {
    if (token !== currentLoadToken) return;
    console.error(`Failed to load asset ${symbol}:`, err);
  }
}

// Centralized Financial Currency Formatter
export function getCurrencySymbol(symbol = '', currency = '') {
  if (currency === 'INR' || (typeof symbol === 'string' && (symbol.endsWith('.NS') || symbol.endsWith('.BO')))) {
    return '₹';
  }
  if (currency === 'EUR' || (typeof symbol === 'string' && (symbol.endsWith('.DE') || symbol.endsWith('.PA')))) {
    return '€';
  }
  if (currency === 'GBP' || (typeof symbol === 'string' && (symbol.endsWith('.L'))) {
    return '£';
  }
  if (currency === 'JPY' || (typeof symbol === 'string' && symbol.endsWith('.T'))) {
    return '¥';
  }
  return '$';
}

export function formatCurrencyValue(val, symbol = '', currency = '') {
  if (val == null || isNaN(val)) return '—';
  const sym = getCurrencySymbol(symbol, currency);
  const decimals = (typeof symbol === 'string' && symbol.includes('=X')) ? 4 : 2;
  return `${sym}${Number(val).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

// Cold-Start Alert Controller
const coldStartBanner = document.getElementById('cold-start-banner');
const coldStartMsg = document.getElementById('cold-start-msg');

api.onStatusChange = (status) => {
  if (!coldStartBanner) return;
  if (status.isWaking) {
    coldStartBanner.classList.add('active');
    if (coldStartMsg) coldStartMsg.textContent = status.message;
  } else {
    coldStartBanner.classList.remove('active');
  }
};

// Initialize the terminal only after Supabase confirms the account session.
let appStarted = false;
async function startApp() {
  if (appStarted) return;
  appStarted = true;
  alertsManager.activateAccount();
  const chartContainer = document.getElementById('tv-chart-container');
  const legendBox = document.getElementById('chart-legend-box');

  if (chartContainer) {
    chartInstance = new TerminalChart(chartContainer, legendBox, (activeList) => {
      updateIndicatorsBadge(activeList);
      if (isIndicatorPickerOpen()) {
        renderIndicatorList();
      }
    });
    window.apexChartInstance = chartInstance;
    window.apexPatchLatestBar = (data) => chartInstance?.patchLatestBar(data);
    window.apexWatchlist = watchlist;
    window.updateChartTelemetry = updateChartTelemetry;
    updateIndicatorsBadge(chartInstance.getActiveIndicatorsList());
  }

  // Router Subscription: 6 Institutional Workspaces
  router.subscribe(async (route) => {
    if (route.type === 'markets' || route.workspace === 'markets') {
      setWorkspace('markets');
    } else if (route.type === 'discover' || route.workspace === 'discover' || route.type === 'screener') {
      setWorkspace('discover', route.universe);
    } else if (route.type === 'compare' || route.workspace === 'compare') {
      if (route.symbol && route.symbol !== currentSymbol) {
        await loadStock(route.symbol, currentTimeframe);
      }
      setWorkspace('compare');
    } else if (route.type === 'research' || route.workspace === 'research') {
      if (route.symbol && route.symbol !== currentSymbol) {
        await loadStock(route.symbol, currentTimeframe);
      }
      setWorkspace('research', route.subTab || 'news');
    } else if (route.type === 'monitor' || route.workspace === 'monitor') {
      setWorkspace('monitor', route.subTab || 'watchlist');
    } else if (route.type === 'symbol' || route.type === 'analyze' || route.workspace === 'analyze') {
      const targetSym = route.symbol || currentSymbol || 'TCS.NS';
      const targetTab = route.tab || 'chart';
      setWorkspace('analyze', targetTab);
      if (!currentSymbol || targetSym !== currentSymbol) {
        await loadStock(targetSym, currentTimeframe);
      }
    } else if (route.type === 'markets' || route.type =
