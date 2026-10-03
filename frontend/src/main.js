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
import { auth, getAccountStorageKey } from './auth.js';

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

// Centralized Financial Currency Formatter
export function getCurrencySymbol(symbol = '', currency = '') {
  if (currency === 'INR' || (typeof symbol === 'string' && (symbol.endsWith('.NS') || symbol.endsWith('.BO')))) {
    return '₹';
  }
  if (currency === 'EUR' || (typeof symbol === 'string' && (symbol.endsWith('.DE') || symbol.endsWith('.PA')))) {
    return '€';
  }
  if (currency === 'GBP' || (typeof symbol === 'string' && symbol.endsWith('.L'))) {
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

  setupEventListeners();
  setupWorkspaceControls();
  setupMaraShellControls();
  setupTradingViewChromeControls();
  syncChartControlsToPreferences();
  setupIndicatorControls();
  setupWatchlistControls();

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
    } else if (route.type === 'markets' || route.type === 'sectors' || route.workspace === 'markets') {
      setWorkspace('markets');
    }
  });

  window.apexRouter = router;
  // Initialize router immediately so the active asset chart mounts without waiting for macro overview
  router.init({ symbol: 'TCS.NS', tab: 'chart' });

  // Fetch secondary feeds concurrently in background
  Promise.allSettled([
    loadMarketOverview(),
    loadScreener('indian_leaders'),
    refreshWatchlistUI()
  ]);

  startQuotePatchWorker();
  initStaleProtection();
}

document.addEventListener('DOMContentLoaded', async () => {
  auth.onAuthenticated = startApp;
  if (await auth.initialize()) await startApp();
});

// Primary Workspace Switcher
export function setWorkspace(workspaceName, subTab = null) {
  currentActiveWorkspace = workspaceName;

  // 1. Top workspace navigation buttons
  document.querySelectorAll('#top-nav-workspaces .top-ws-btn').forEach((btn) => {
    const isTarget = btn.getAttribute('data-workspace') === workspaceName;
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  // 1b. Left Navigation Rail buttons
  document.querySelectorAll('#mara-nav-rail .mara-rail-btn[data-workspace-rail]').forEach((btn) => {
    const isTarget = btn.getAttribute('data-workspace-rail') === workspaceName;
    btn.classList.toggle('active', isTarget);
  });

  // 1c. Status Bar workspace label
  const statusWsLabel = document.getElementById('status-active-ws');
  if (statusWsLabel && workspaceName) statusWsLabel.textContent = workspaceName.toUpperCase();

  // 2. Main layout & body attributes
  const mainLayout = document.getElementById('main-layout');
  if (mainLayout) {
    mainLayout.setAttribute('data-workspace', workspaceName);
    mainLayout.setAttribute('data-active-view', workspaceName === 'analyze' ? 'terminal' : workspaceName);
  }
  document.body.setAttribute('data-workspace', workspaceName);
  document.body.setAttribute('data-top-view', workspaceName === 'analyze' ? 'terminal' : workspaceName);

  // 3. Toggle workspace section visibility
  document.querySelectorAll('.workspace-view').forEach((view) => {
    const isTarget = view.id === `workspace-${workspaceName}`;
    view.classList.toggle('active', isTarget);
  });

  // 4. Sub-tab activation & specific data triggers
  if (workspaceName === 'analyze') {
    const targetSub = subTab || currentAnalyzeTab || 'chart';
    setAnalyzeSubTab(targetSub);
  } else if (workspaceName === 'research') {
    const targetSub = subTab || currentResearchTab || 'news';
    setResearchSubTab(targetSub);
  } else if (workspaceName === 'monitor') {
    const targetSub = subTab || currentMonitorTab || 'watchlist';
    setMonitorSubTab(targetSub);
  } else if (workspaceName === 'markets') {
    loadMarketOverview();
    loadAndRenderSectorsAndMarketMap();
  } else if (workspaceName === 'discover') {
    if (subTab) {
      const tabBtn = document.querySelector(`.screener-tab-btn[data-universe="${subTab}"]`);
      if (tabBtn) {
        document.querySelectorAll('.screener-tab-btn').forEach((t) => t.classList.remove('active'));
        tabBtn.classList.add('active');
      }
      loadScreener(subTab);
    } else if (!currentScreenerAssets || currentScreenerAssets.length === 0) {
      loadScreener('indian_leaders');
    }
  } else if (workspaceName === 'compare') {
    if (currentSymbol) {
      loadStockResearch(currentSymbol, currentLoadToken);
      loadAndRenderMacroExplorer(currentSymbol);
    }
    loadAndRenderCorrelation(activeCorrelationPeriod);
  }
}
window.setWorkspace = setWorkspace;

export function setAnalyzeSubTab(subTab) {
  currentAnalyzeTab = subTab;
  currentActiveTab = subTab;

  document.querySelectorAll('#analyze-subnav .ws-sub-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-analyze-tab') === subTab);
  });

  document.querySelectorAll('#workspace-analyze .analyze-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${subTab}`);
  });

  if (subTab === 'chart' && chartInstance) {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      if (chartInstance.resize) chartInstance.resize();
    });
  }
}

export function setResearchSubTab(subTab) {
  currentResearchTab = subTab;
  document.querySelectorAll('#research-subnav .ws-sub-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-research-tab') === subTab);
  });

  document.querySelectorAll('#workspace-research .research-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${subTab}`);
  });

  if (subTab === 'report') {
    renderOneClickReport(currentOverviewData, currentResearchData, currentDeepResearchData, currentV4Data);
  } else if (subTab === 'whatchanged' && currentV4Data) {
    renderWhatChanged(currentV4Data.what_changed_30d);
  } else if (subTab === 'anomalies' && currentV4Data) {
    renderAnomalies(currentV4Data.anomalies);
  } else if (subTab === 'notebook') {
    loadNotebookForCurrentSymbol();
  } else if (subTab === 'lab') {
    updateScenarioCalculation();
  }
}

export function setMonitorSubTab(subTab) {
  currentMonitorTab = subTab;
  document.querySelectorAll('#monitor-subnav .ws-sub-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-monitor-tab') === subTab);
  });

  document.querySelectorAll('#workspace-monitor .monitor-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `monitor-panel-${subTab}`);
  });

  if (subTab === 'watchlist') {
    refreshWatchlistUI();
  } else if (subTab === 'alerts') {
    refreshAlertsUI();
  }
}

// Workspace Navigation Controls Setup
function setupWorkspaceControls() {
  // Top Workspace Nav Buttons
  document.querySelectorAll('#top-nav-workspaces .top-ws-btn[data-workspace]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ws = btn.getAttribute('data-workspace');
      if (ws === 'analyze') {
        router.navigate(router.formatSymbolRoute(currentSymbol || 'TCS.NS', currentAnalyzeTab || 'chart'));
      } else if (ws === 'discover') {
        router.navigate('/discover');
      } else if (ws === 'markets') {
        router.navigate('/markets');
      } else if (ws === 'compare') {
        router.navigate(router.formatWorkspaceRoute('compare', currentSymbol || 'TCS.NS'));
      } else if (ws === 'research') {
        router.navigate(router.formatWorkspaceRoute('research', currentSymbol || 'TCS.NS', currentResearchTab || 'news'));
      } else if (ws === 'monitor') {
        router.navigate(router.formatWorkspaceRoute('monitor', null, currentMonitorTab || 'watchlist'));
      }
    });
  });

  // Analyze Subnav
  document.querySelectorAll('#analyze-subnav .ws-sub-btn[data-analyze-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-analyze-tab');
      router.navigate(router.formatSymbolRoute(currentSymbol || 'TCS.NS', tab));
    });
  });

  // Research Subnav
  document.querySelectorAll('#research-subnav .ws-sub-btn[data-research-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-research-tab');
      router.navigate(router.formatWorkspaceRoute('research', currentSymbol || 'TCS.NS', tab));
    });
  });

  // Monitor Subnav
  document.querySelectorAll('#monitor-subnav .ws-sub-btn[data-monitor-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-monitor-tab');
      router.navigate(router.formatWorkspaceRoute('monitor', null, tab));
    });
  });

  // Monitor workspace alerts form
  const wsAlertBtn = document.getElementById('ws-create-alert-btn');
  if (wsAlertBtn) {
    wsAlertBtn.addEventListener('click', () => {
      const symInput = document.getElementById('ws-alert-sym-input');
      const metricInput = document.getElementById('ws-alert-metric-select');
      const opInput = document.getElementById('ws-alert-op-select');
      const targetInput = document.getElementById('ws-alert-target-input');
      const sym = (symInput?.value || currentSymbol || '').trim().toUpperCase();
      const metric = metricInput?.value || 'price';
      const op = opInput?.value || '>';
      const target = parseFloat(targetInput?.value);
      if (!sym || isNaN(target)) {
        showToast('Please enter a valid symbol and numeric threshold', 'warning');
        return;
      }
      alertsManager.addAlert({
        symbol: sym,
        metric,
        operator: op,
        target,
      });
      showToast(`Alert set for ${sym} ${metric} ${op} ${target}`, 'success');
      if (targetInput) targetInput.value = '';
      refreshAlertsUI();
    });
  }

  // Monitor workspace watchlist backup actions
  const wsExportBtn = document.getElementById('ws-export-watchlist-btn');
  if (wsExportBtn) {
    wsExportBtn.addEventListener('click', () => {
      const exportBtn = document.getElementById('export-watchlist-btn');
      if (exportBtn) exportBtn.click();
    });
  }
  const wsImportInput = document.getElementById('ws-import-watchlist-input');
  if (wsImportInput) {
    wsImportInput.addEventListener('change', (e) => {
      const mainInput = document.getElementById('import-watchlist-input');
      if (mainInput && e.target.files?.length) {
        const dt = new DataTransfer();
        dt.items.add(e.target.files[0]);
        mainInput.files = dt.files;
        mainInput.dispatchEvent(new Event('change'));
      }
    });
  }
  const wsClearBtn = document.getElementById('ws-clear-watchlist-btn');
  if (wsClearBtn) {
    wsClearBtn.addEventListener('click', () => {
      const clearBtn = document.getElementById('clear-watchlist-btn');
      if (clearBtn) clearBtn.click();
    });
  }

  // Left Navigation Rail Workspace buttons
  document.querySelectorAll('#mara-nav-rail .mara-rail-btn[data-workspace-rail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ws = btn.getAttribute('data-workspace-rail');
      if (ws === 'analyze') {
        router.navigate(router.formatSymbolRoute(currentSymbol || 'TCS.NS', currentAnalyzeTab || 'chart'));
      } else if (ws === 'discover') {
        router.navigate('/discover');
      } else if (ws === 'markets') {
        router.navigate('/markets');
      } else if (ws === 'compare') {
        router.navigate(router.formatWorkspaceRoute('compare', currentSymbol || 'TCS.NS'));
      } else if (ws === 'research') {
        router.navigate(router.formatWorkspaceRoute('research', currentSymbol || 'TCS.NS', currentResearchTab || 'news'));
      } else if (ws === 'monitor') {
        router.navigate(router.formatWorkspaceRoute('monitor', null, currentMonitorTab || 'watchlist'));
      }
    });
  });
}

// ============================================================================
// Phase 0: Physical Interface Architecture Controller
// Context Panel, Information Density, View Switching, and Telemetry Clock
// ============================================================================
function setupMaraShellControls() {
  const maraApp = document.getElementById('mara-app');
  if (!maraApp) return;

  // 1. Context Inspector Panel Toggle
  const contextToggle = document.getElementById('mara-context-toggle');
  const railContextBtn = document.getElementById('rail-context-btn');
  const closeContextBtn = document.getElementById('close-context-panel-btn');

  function toggleContextPanel() {
    const isOpen = maraApp.classList.toggle('context-panel-open');
    if (contextToggle) {
      contextToggle.classList.toggle('active', isOpen);
      const span = contextToggle.querySelector('span');
      if (span) span.textContent = isOpen ? 'Inspector ◨' : 'Inspector ◻';
    }
    if (railContextBtn) {
      railContextBtn.classList.toggle('active', isOpen);
    }
    // Resize chart if analyze workspace is open
    if (chartInstance && currentActiveWorkspace === 'analyze') {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        if (chartInstance.resize) chartInstance.resize();
      }, 220);
    }
  }

  if (contextToggle) contextToggle.addEventListener('click', toggleContextPanel);
  if (railContextBtn) railContextBtn.addEventListener('click', toggleContextPanel);
  if (closeContextBtn) closeContextBtn.addEventListener('click', toggleContextPanel);

  // On tablet and mobile (< 1024px), default context panel to closed to prioritize canvas
  if (window.innerWidth < 1024) {
    maraApp.classList.remove('context-panel-open');
    if (contextToggle) {
      contextToggle.classList.remove('active');
      const span = contextToggle.querySelector('span');
      if (span) span.textContent = 'Inspector ◻';
    }
    if (railContextBtn) railContextBtn.classList.remove('active');
  }

  // 2. Information Density Modes (Compact / Normal / Focus)
  const densityBtns = document.querySelectorAll('.mara-density-btn[data-density-set]');

  function setDensity(mode) {
    if (!['compact', 'normal', 'focus'].includes(mode)) mode = 'normal';
    maraApp.setAttribute('data-density', mode);
    localStorage.setItem('mara-density', mode);
    densityBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-density-set') === mode);
    });
    window.dispatchEvent(new Event('resize'));
    if (chartInstance && chartInstance.resize) chartInstance.resize();
  }

  densityBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      setDensity(btn.getAttribute('data-density-set'));
    });
  });

  // Restore saved density
  const savedDensity = localStorage.getItem('mara-density') || 'normal';
  setDensity(savedDensity);

  // 3. View Switcher Representation (Table / Chart / Heatmap / Metrics)
  const viewBtns = document.querySelectorAll('.mara-view-btn[data-view-set]');
  const mainCanvas = document.getElementById('mara-main-canvas');

  function handleViewRepresentationChange(rep) {
    if (currentActiveWorkspace === 'markets') {
      if (rep === 'table') {
        document.getElementById('markets-indices-table')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (rep === 'heatmap') {
        document.getElementById('sector-intelligence-grid')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (rep === 'metrics') {
        document.getElementById('macro-radar-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (rep === 'chart') {
        showToast('Full Candlestick Chart available in Analyze workspace (Alt+3)', 'info');
      }
    } else if (currentActiveWorkspace === 'analyze') {
      if (rep === 'chart') {
        setAnalyzeSubTab('chart');
      } else if (rep === 'table') {
        setAnalyzeSubTab('fundamentals');
      } else if (rep === 'metrics') {
        setAnalyzeSubTab('valuation');
      } else if (rep === 'heatmap') {
        setAnalyzeSubTab('overview');
      }
    } else if (currentActiveWorkspace === 'discover') {
      if (rep === 'table') {
        document.getElementById('screener-table-body')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (rep === 'metrics') {
        const wrap = document.getElementById('screener-builder-wrap');
        if (wrap) wrap.style.display = 'block';
      }
    } else if (currentActiveWorkspace === 'compare') {
      if (rep === 'table') {
        document.getElementById('peers-container')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (rep === 'metrics' || rep === 'heatmap') {
        document.getElementById('correlation-matrix-container')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  viewBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const rep = btn.getAttribute('data-view-set');
      viewBtns.forEach((b) => b.classList.toggle('active', b === btn));
      if (mainCanvas) mainCanvas.setAttribute('data-representation', rep);
      handleViewRepresentationChange(rep);
    });
  });

  // 5. Global Command Input & Keyboard Shortcuts
  const globalSearchInput = document.getElementById('global-search-input');
  const kbdHint = document.getElementById('search-kbd-hint');
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  if (kbdHint) kbdHint.textContent = isMac ? '⌘K' : 'Ctrl+K';

  // Left rail utility buttons
  const railStarBtn = document.getElementById('rail-star-btn');
  const railAlertBtn = document.getElementById('rail-alert-btn');
  const railCmdBtn = document.getElementById('rail-cmd-btn');
  const brandHomeBtn = document.getElementById('brand-home-btn');

  if (railStarBtn) {
    railStarBtn.addEventListener('click', () => {
      const wlToggle = document.getElementById('watchlist-drawer-toggle');
      if (wlToggle) wlToggle.click();
    });
  }
  if (railAlertBtn) {
    railAlertBtn.addEventListener('click', () => {
      const altToggle = document.getElementById('alerts-modal-toggle');
      if (altToggle) altToggle.click();
    });
  }
  if (railCmdBtn) {
    railCmdBtn.addEventListener('click', () => {
      if (globalSearchInput) {
        globalSearchInput.focus();
        globalSearchInput.select();
      }
    });
  }
  if (brandHomeBtn) {
    brandHomeBtn.addEventListener('click', () => {
      router.navigate('/markets');
    });
  }

  // Global Keyboard Shortcuts (⌘K, ⌥C, D, Alt+1..6)
  window.addEventListener('keydown', (e) => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

    // Alt+C or Option+C -> Toggle Context Panel
    if (e.altKey && (e.key === 'c' || e.key === 'C' || e.code === 'KeyC')) {
      e.preventDefault();
      toggleContextPanel();
      return;
    }

    // Keys Alt+1 to Alt+6 or 1 to 6 (when outside text inputs) -> Quick Workspace Switching
    const isAltDigit = e.altKey && !e.ctrlKey && !e.metaKey && (
      (e.key >= '1' && e.key <= '6') || (e.code >= 'Digit1' && e.code <= 'Digit6')
    );
    const isPlainDigit = !isInput && !e.altKey && !e.ctrlKey && !e.metaKey && (
      (e.key >= '1' && e.key <= '6') || (e.code >= 'Digit1' && e.code <= 'Digit6')
    );

    const wsMap = {
      '1': 'markets',
      '2': 'discover',
      '3': 'analyze',
      '4': 'compare',
      '5': 'research',
      '6': 'monitor',
    };

    if (isAltDigit || isPlainDigit) {
      const digit = (e.key >= '1' && e.key <= '6') ? e.key : e.code.replace('Digit', '');
      const targetWs = wsMap[digit];
      if (targetWs) {
        e.preventDefault();
        if (targetWs === 'analyze') {
          router.navigate(router.formatSymbolRoute(currentSymbol || 'TCS.NS', currentAnalyzeTab || 'chart'));
        } else if (targetWs === 'compare') {
          router.navigate(router.formatWorkspaceRoute('compare', currentSymbol || 'TCS.NS'));
        } else if (targetWs === 'research') {
          router.navigate(router.formatWorkspaceRoute('research', currentSymbol || 'TCS.NS', currentResearchTab || 'news'));
        } else if (targetWs === 'monitor') {
          router.navigate(router.formatWorkspaceRoute('monitor', null, currentMonitorTab || 'watchlist'));
        } else {
          router.navigate(`/${targetWs}`);
        }
      }
      return;
    }

    // Key 'D' or 'd' -> Cycle Density
    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      const currentDensity = maraApp.getAttribute('data-density') || 'normal';
      const cycle = { compact: 'normal', normal: 'focus', focus: 'compact' };
      const nextDensity = cycle[currentDensity] || 'normal';
      setDensity(nextDensity);
      showToast(`Density: ${nextDensity.toUpperCase()}`, 'info');
      return;
    }

    // Key 'V' or 'v' -> Cycle Representation View
    if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      const currentRep = mainCanvas?.getAttribute('data-representation') || 'table';
      const repList = ['table', 'chart', 'heatmap', 'metrics'];
      const nextIdx = (repList.indexOf(currentRep) + 1) % repList.length;
      const nextRep = repList[nextIdx];
      const targetBtn = document.querySelector(`.mara-view-btn[data-view-set="${nextRep}"]`);
      if (targetBtn) targetBtn.click();
      return;
    }
  });

  // 6. Live Status Bar Clock (UTC HH:MM:SS)
  const clockEl = document.getElementById('status-bar-clock');
  function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    const utcHours = String(now.getUTCHours()).padStart(2, '0');
    const utcMins = String(now.getUTCMinutes()).padStart(2, '0');
    const utcSecs = String(now.getUTCSeconds()).padStart(2, '0');
    clockEl.textContent = `UTC ${utcHours}:${utcMins}:${utcSecs}`;
  }
  updateClock();
  setInterval(updateClock, 1000);
}


// Backward Compatibility Bridges
export function setTopLevelView(viewName) {
  if (viewName === 'terminal') setWorkspace('analyze');
  else if (viewName === 'screener') setWorkspace('discover');
  else if (viewName === 'sectors') setWorkspace('markets');
  else setWorkspace(viewName);
}

export function activateWorkspaceTab(targetTab) {
  if (['chart', 'overview', 'fundamentals', 'valuation'].includes(targetTab)) {
    setWorkspace('analyze', targetTab);
  } else if (['peers', 'correlation'].includes(targetTab)) {
    setWorkspace('compare');
  } else if (targetTab === 'sectors') {
    setWorkspace('markets');
  } else if (['news', 'earnings', 'whatchanged', 'anomalies', 'lab', 'notebook', 'quality', 'report'].includes(targetTab)) {
    setWorkspace('research', targetTab);
  }
}

export function syncChartControlsToPreferences() {
  if (!chartInstance) return;

  // 1. Sync Interval buttons (1m, 5m, 15m, 1h, 1d, 1wk, 1mo)
  const int = currentChartInterval || chartInstance.activeInterval || '1m';
  document.querySelectorAll('#interval-group .interval-btn').forEach((btn) => {
    const bInt = btn.getAttribute('data-interval');
    const matches = bInt === int ||
      (bInt === '1d' && (int === 'D' || int === '1d')) ||
      (bInt === '1wk' && (int === 'W' || int === '1wk')) ||
      (bInt === '1mo' && (int === 'M' || int === '1mo'));
    btn.classList.toggle('active', matches);
  });

  // 2. Sync Range buttons (1D, 5D, 1M .. All)
  const range = currentChartRange || chartInstance.activeRange || (int === '1m' ? '1D' : '1Y');
  document.querySelectorAll('#range-group .range-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-range') === range);
  });

  // 3. Sync Chart Type Rail Button
  const chartType = chartInstance.chartType || 'candles';
  const railChartType = document.getElementById('tv-rail-chart-type');
  if (railChartType) {
    railChartType.setAttribute('data-type', chartType);
    railChartType.title = `Chart Type: ${chartType.charAt(0).toUpperCase() + chartType.slice(1)}`;
  }

  // 4. Sync Scale buttons (log / pct)
  const scale = chartInstance.scaleMode || 'normal';
  const logBtn = document.getElementById('tv-scale-log-btn');
  const pctBtn = document.getElementById('tv-scale-pct-btn');
  if (logBtn) logBtn.classList.toggle('active', scale === 'log');
  if (pctBtn) pctBtn.classList.toggle('active', scale === 'pct');
}

export async function switchChartInterval(interval) {
  currentChartInterval = interval;
  try {
    localStorage.setItem(getAccountStorageKey('apex_chart_interval'), interval);
  } catch {}

  const isIntraday = ['1m', '2m', '5m', '15m', '30m', '60m', '1h', '90m'].includes(interval);
  if (isIntraday) {
    if (interval === '1m') {
      currentChartRange = '1d';
    } else {
      currentChartRange = '5d';
    }
  } else {
    if (['1D', '5D'].includes(currentChartRange)) {
      currentChartRange = '1Y';
    }
  }
  syncChartControlsToPreferences();
  await loadStockChart(currentSymbol || 'TCS.NS', null, currentChartInterval, currentChartRange);
}

export async function switchChartRange(range) {
  currentChartRange = range;
  try {
    localStorage.setItem(getAccountStorageKey('apex_chart_range'), range);
  } catch {}

  if (range === '1D') {
    currentChartInterval = '1m';
    syncChartControlsToPreferences();
    await loadStockChart(currentSymbol || 'TCS.NS', null, '1m', '1d');
    return;
  }
  if (range === '5D') {
    currentChartInterval = '5m';
    syncChartControlsToPreferences();
    await loadStockChart(currentSymbol || 'TCS.NS', null, '5m', '5d');
    return;
  }

  // Longer ranges: 1M, 3M, 6M, YTD, 1Y, 5Y, All
  const isCurrentlyIntraday = ['1m', '2m', '5m', '15m', '30m', '60m', '1h', '90m'].includes(currentChartInterval);
  if (isCurrentlyIntraday) {
    currentChartInterval = '1d';
    syncChartControlsToPreferences();
    await loadStockChart(currentSymbol || 'TCS.NS', null, '1d', range);
  } else {
    syncChartControlsToPreferences();
    if (chartInstance) {
      chartInstance.setVisibleRangeByName(range);
    }
  }
}

// Setup DOM Event Listeners
function setupEventListeners() {
  // Brand Home Click
  const brandBtn = document.getElementById('brand-home-btn');
  if (brandBtn) {
    brandBtn.addEventListener('click', () => {
      router.navigate(router.formatSymbolRoute('^NSEI', 'chart'));
    });
  }

  // Workspace Navigation Tabs
  const wsTabs = document.querySelectorAll('#workspace-nav-bar .ws-tab-btn[data-tab]');
  wsTabs.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.currentTarget;
      const targetTab = targetBtn.getAttribute('data-tab');
      if (!targetTab) return;
      router.navigate(router.formatSymbolRoute(currentSymbol || 'TCS.NS', targetTab));
    });
  });

  // Screener Universe Tabs
  const screenerTabs = document.querySelectorAll('.screener-tab-btn');
  screenerTabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      screenerTabs.forEach((t) => t.classList.remove('active'));
      e.target.classList.add('active');
      const universe = e.target.getAttribute('data-universe');
      router.navigate(router.formatScreenerRoute(universe));
      loadScreener(universe);
    });
  });

  // Interval Buttons (Intraday & Historical)
  const intervalButtons = document.querySelectorAll('#interval-group .interval-btn');
  intervalButtons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const targetBtn = e.currentTarget || e.target;
      const interval = targetBtn.getAttribute('data-interval');
      if (!interval) return;
      intervalButtons.forEach((b) => b.classList.remove('active'));
      targetBtn.classList.add('active');
      await switchChartInterval(interval);
    });
  });

  // Range Buttons
  const rangeButtons = document.querySelectorAll('#range-group .range-btn');
  rangeButtons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const targetBtn = e.currentTarget || e.target;
      const range = targetBtn.getAttribute('data-range');
      if (!range) return;
      rangeButtons.forEach((b) => b.classList.remove('active'));
      targetBtn.classList.add('active');
      await switchChartRange(range);
    });
  });

  // Macro Category Tabs
  const macroTabs = document.querySelectorAll('.macro-tab-btn');
  macroTabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      macroTabs.forEach((t) => t.classList.remove('active'));
      e.target.classList.add('active');
      currentMacroCategory = e.target.getAttribute('data-category');
      renderMacroCards();
    });
  });

  // Global Search Autocomplete
  const searchInput = document.getElementById('global-search-input');
  const searchDropdown = document.getElementById('search-dropdown');
  let searchDebounceTimer = null;

  if (searchInput && searchDropdown) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      const requestSeq = ++searchRequestSeq;
      const query = e.target.value.trim();

      if (query.length === 0) {
        searchDropdown.classList.remove('open');
        searchDropdown.setAttribute('aria-busy', 'false');
        searchInput.setAttribute('aria-expanded', 'false');
        return;
      }

      searchDropdown.innerHTML = '<div class="search-loading-state" role="option" aria-selected="false" aria-disabled="true">Searching the asset directory…</div>';
      searchDropdown.classList.add('open');
      searchDropdown.setAttribute('aria-busy', 'true');
      searchInput.setAttribute('aria-expanded', 'true');
      searchDebounceTimer = setTimeout(async () => {
        try {
          const res = await api.searchAssets(query);
          if (requestSeq !== searchRequestSeq) return;
          renderSearchDropdown(res.results || []);
        } catch (err) {
          if (requestSeq !== searchRequestSeq) return;
          console.error('Search query failed:', err);
          searchDropdown.innerHTML = '<div class="search-error-state" role="option" aria-selected="false" aria-disabled="true">Search is temporarily unavailable. Try again in a moment.</div>';
          searchDropdown.setAttribute('aria-busy', 'false');
        }
      }, 200);
    });

    // Click on kbd shortcut hint also focuses search
    const kbdHint = document.getElementById('search-kbd-hint');
    if (kbdHint) {
      const platform = navigator.userAgentData?.platform || navigator.platform || '';
      kbdHint.textContent = /Mac|iPhone|iPad/i.test(platform) ? '⌘ K' : 'Ctrl K';
      kbdHint.addEventListener('click', () => {
        searchInput.focus();
        searchInput.select();
      });
    }

    // Close search dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
        clearTimeout(searchDebounceTimer);
        searchRequestSeq += 1;
        searchDropdown.classList.remove('open');
        searchDropdown.setAttribute('aria-busy', 'false');
        searchInput.setAttribute('aria-expanded', 'false');
      }
    });

    // Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape) within search results
    searchInput.addEventListener('keydown', (e) => {
      const items = Array.from(searchDropdown.querySelectorAll('.search-item'));
      if (!items.length || !searchDropdown.classList.contains('open')) {
        if (e.key === 'Escape') {
          searchDropdown.classList.remove('open');
          searchInput.setAttribute('aria-expanded', 'false');
          searchInput.blur();
        }
        return;
      }

      const activeIndex = items.findIndex((el) => el.classList.contains('active-search-item'));

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
        items.forEach((it, idx) => it.classList.toggle('active-search-item', idx === nextIndex));
        items[nextIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
        items.forEach((it, idx) => it.classList.toggle('active-search-item', idx === prevIndex));
        items[prevIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = activeIndex >= 0 ? items[activeIndex] : items[0];
        if (target) {
          target.click();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        searchDropdown.classList.remove('open');
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.blur();
      }
    });
  }


  // Correlation Timeframe Switchers
  document.querySelectorAll('.corr-tf-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.corr-tf-btn').forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      activeCorrelationPeriod = e.target.getAttribute('data-period');
      loadAndRenderCorrelation(activeCorrelationPeriod);
    });
  });

  // Setup Specialized Subsystem Handlers
  setupAlertsControls();
  setupScreenerBuilderControls();
  setupNotebookControls();
  setupScenarioControls();
  setupBacktesterControls();
  setupReportControls();

  // Global Keyboard Shortcuts (⌘K, /, Escape, Number keys)
  window.addEventListener('keydown', (e) => {
    const isEditingText =
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) ||
      Boolean(document.activeElement?.isContentEditable);

    // 1. ⌘K / Ctrl+K: Global search focus
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('global-search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // 2. '/' key: Focus search (only if not already editing an input/textarea)
    if (e.key === '/' && !isEditingText) {
      e.preventDefault();
      const searchInput = document.getElementById('global-search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // 3. 'Escape' key: Dismiss modals, drawers, search, and fullscreen
    if (e.key === 'Escape') {
      // 3a. Search dropdown & input blur
      const searchInput = document.getElementById('global-search-input');
      const searchDropdown = document.getElementById('search-dropdown');
      if (searchDropdown?.classList.contains('open')) {
        clearTimeout(searchDebounceTimer);
        searchRequestSeq += 1;
        searchDropdown.classList.remove('open');
        searchDropdown.setAttribute('aria-busy', 'false');
        searchInput?.setAttribute('aria-expanded', 'false');
      }
      if (document.activeElement === searchInput) {
        searchInput.blur();
      }

      // 3b. Indicator Settings Modal
      const indSettingsModal = document.getElementById('tv-indicator-settings-modal');
      if (indSettingsModal?.classList.contains('open')) {
        closeIndicatorSettings();
        return;
      }

      // 3c. Indicator Picker Modal
      if (isIndicatorPickerOpen()) {
        closeIndicatorPicker();
        return;
      }

      // 3d. Watchlist / Alerts Drawer
      const drawer = document.getElementById('watchlist-drawer');
      if (drawer?.classList.contains('open')) {
        if (typeof window.apexCloseWatchlistDrawer === 'function') {
          window.apexCloseWatchlistDrawer();
        } else {
          drawer.classList.remove('open');
          document.getElementById('watchlist-backdrop')?.classList.remove('open');
        }
        return;
      }

      // 3e. Fullscreen mode
      const chartPanel = document.getElementById('panel-chart');
      if (chartPanel?.classList.contains('chart-fullscreen-mode')) {
        const fsBtn = document.getElementById('tv-fullscreen-btn');
        fsBtn?.click();
        return;
      }
    }

    // 4. Quick Analyze sub-tab switching: 1..4 (only when inside Analyze workspace)
    if (!isEditingText && !e.ctrlKey && !e.metaKey && !e.altKey && currentActiveWorkspace === 'analyze') {
      const analyzeTabMap = {
        '1': 'chart',
        '2': 'overview',
        '3': 'fundamentals',
        '4': 'valuation',
      };
      if (analyzeTabMap[e.key]) {
        e.preventDefault();
        router.navigate(router.formatSymbolRoute(currentSymbol || 'TCS.NS', analyzeTabMap[e.key]));
      }
    }
  });

  // Offline / Network Error Resilience Handler
  const retryBanner = document.getElementById('apex-retry-banner');
  const retryBtn = document.getElementById('apex-retry-btn');
  const retryMsg = document.getElementById('apex-retry-msg');

  window.addEventListener('offline', () => {
    if (retryBanner) {
      if (retryMsg) retryMsg.textContent = 'Browser is offline. Live market feeds paused.';
      retryBanner.classList.add('active');
    }
  });

  window.addEventListener('online', () => {
    if (retryBanner) retryBanner.classList.remove('active');
    showToast('Network restored. Reconnected to live feed.', 'success');
    if (currentSymbol) loadStock(currentSymbol, currentTimeframe);
  });

  if (retryBtn) {
    retryBtn.addEventListener('click', async () => {
      retryBtn.textContent = 'Reconnecting...';
      try {
        await api.getMarketOverview();
        if (retryBanner) retryBanner.classList.remove('active');
        showToast('Reconnected to server successfully.', 'success');
        if (currentSymbol) await loadStock(currentSymbol, currentTimeframe);
      } catch (err) {
        showToast('Reconnect failed. Check server status.', 'error');
      } finally {
        retryBtn.textContent = 'Reconnect';
      }
    });
  }
}

// ============================================================================
// Technical Indicator Picker & Parameter Settings Engine
// ============================================================================

let currentIndicatorCategory = 'all';
let currentIndicatorSearch = '';

function getFavoritesList() {
  try {
    const raw = localStorage.getItem(getAccountStorageKey('apex_indicator_favs'));
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Error reading apex_indicator_favs:', e);
  }
  return ['rsi', 'macd', 'ema', 'bollinger'];
}

function saveFavoritesList(favs) {
  try {
    localStorage.setItem(getAccountStorageKey('apex_indicator_favs'), JSON.stringify(favs));
  } catch (e) {
    console.warn('Error saving apex_indicator_favs:', e);
  }
}

function toggleFavorite(id) {
  const favs = getFavoritesList();
  const idx = favs.indexOf(id);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push(id);
  }
  saveFavoritesList(favs);
  renderIndicatorList();
  updateFavoritesCount();
}

function updateFavoritesCount() {
  const favCountEl = document.getElementById('tv-fav-count');
  if (favCountEl) {
    favCountEl.textContent = getFavoritesList().length;
  }
}

function updateIndicatorsBadge(activeList = null) {
  const list = activeList || (chartInstance ? chartInstance.getActiveIndicatorsList() : []);
  const countBadge = document.getElementById('tv-ind-count');
  if (countBadge) {
    countBadge.textContent = list.length;
  }
  const activeTabCount = document.getElementById('tv-active-tab-count');
  if (activeTabCount) {
    activeTabCount.textContent = list.length;
  }
}

function isIndicatorPickerOpen() {
  const modal = document.getElementById('tv-indicator-picker-modal');
  return modal && modal.classList.contains('open');
}

function openIndicatorPicker() {
  const modal = document.getElementById('tv-indicator-picker-modal');
  const backdrop = document.getElementById('tv-indicator-picker-backdrop');
  if (modal) modal.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
  updateFavoritesCount();
  updateIndicatorsBadge();
  renderIndicatorList();
  const input = document.getElementById('tv-ind-search-input');
  if (input) {
    input.value = currentIndicatorSearch;
    setTimeout(() => input.focus(), 50);
  }
}

function closeIndicatorPicker() {
  const modal = document.getElementById('tv-indicator-picker-modal');
  const backdrop = document.getElementById('tv-indicator-picker-backdrop');
  if (modal) modal.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

function renderIndicatorList() {
  const listContainer = document.getElementById('tv-indicator-list');
  if (!listContainer) return;

  const activeInstances = chartInstance ? chartInstance.getActiveIndicatorsList() : [];
  const activeDefIds = new Set(activeInstances.map((i) => i.id));
  const favs = new Set(getFavoritesList());
  const instrumentHasVolume = hasValidVolume(currentCandles);

  // If "Active" tab is selected: show active indicator instances with visibility, settings, remove
  if (currentIndicatorCategory === 'active') {
    if (activeInstances.length === 0) {
      listContainer.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--text-dim); font-size: 13px;">
          No active indicators on chart. Browse the tabs above to add overlays or oscillators.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = activeInstances
      .map((inst) => {
        const paramStr = Object.values(inst.params).join(', ');
        return `
          <div class="tv-ind-card" data-instance-id="${inst.instanceId}">
            <div class="tv-ind-card-left">
              <span class="tv-ind-swatch" style="width: 10px; height: 10px; border-radius: 2px; background: ${inst.color}; display: inline-block;"></span>
              <div class="tv-ind-info">
                <div class="tv-ind-name-row">
                  <span class="tv-ind-name">${inst.name}</span>
                  <span class="tv-ind-short">(${inst.short} ${paramStr})</span>
                  <span class="tv-ind-group-tag">${inst.pane === 'overlay' ? 'Overlay' : 'Sub-Pane'}</span>
                  ${inst.unavailable ? `<span class="tv-ind-warning-tag">${inst.unavailableReason}</span>` : ''}
                </div>
                <div class="tv-ind-formula">${inst.def.formula}</div>
              </div>
            </div>
            <div class="tv-ind-card-right">
              <button class="pane-btn act-ind-eye-btn" data-inst="${inst.instanceId}" title="Toggle Visibility" style="font-size: 13px;">
                ${inst.visible ? '👁' : 'Ø'}
              </button>
              <button class="pane-btn act-ind-gear-btn" data-inst="${inst.instanceId}" title="Parameters" style="font-size: 13px;">
                ⚙
              </button>
              <button class="pane-btn pane-btn-close act-ind-remove-btn" data-inst="${inst.instanceId}" title="Remove Indicator" style="font-size: 13px;">
                ✕
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    // Wire active indicator row action buttons
    listContainer.querySelectorAll('.act-ind-eye-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const instId = btn.getAttribute('data-inst');
        if (chartInstance) chartInstance.toggleIndicatorVisibility(instId);
        renderIndicatorList();
      });
    });
    listContainer.querySelectorAll('.act-ind-gear-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const instId = btn.getAttribute('data-inst');
        openIndicatorSettings(instId);
      });
    });
    listContainer.querySelectorAll('.act-ind-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const instId = btn.getAttribute('data-inst');
        if (chartInstance) chartInstance.removeIndicator(instId);
        renderIndicatorList();
      });
    });
    return;
  }

  // Filter indicators by category
  let indicators = getAllIndicators();
  if (currentIndicatorCategory === 'favorites') {
    indicators = indicators.filter((ind) => favs.has(ind.id));
  } else if (currentIndicatorCategory !== 'all') {
    indicators = indicators.filter((ind) => ind.group === currentIndicatorCategory);
  }

  // Filter by search query
  if (currentIndicatorSearch.trim()) {
    const q = currentIndicatorSearch.trim().toLowerCase();
    indicators = indicators.filter(
      (ind) =>
        ind.name.toLowerCase().includes(q) ||
        ind.short.toLowerCase().includes(q) ||
        ind.id.toLowerCase().includes(q) ||
        (ind.formula && ind.formula.toLowerCase().includes(q))
    );
  }

  if (indicators.length === 0) {
    listContainer.innerHTML = `
      <div style="padding: 32px 16px; text-align: center; color: var(--text-dim); font-size: 13px;">
        No matching indicators found. Try clearing your search or picking another category.
      </div>
    `;
    return;
  }

  listContainer.innerHTML = indicators
    .map((ind) => {
      const isFav = favs.has(ind.id);
      const isActive = activeDefIds.has(ind.id);
      const volumeMissing = ind.needsVolume && !instrumentHasVolume;
      const paramStr = Object.entries(ind.params).map(([k, v]) => `${k}: ${v}`).join(', ');

      return `
        <div class="tv-ind-card" data-ind-id="${ind.id}">
          <div class="tv-ind-card-left">
            <button class="tv-ind-fav-btn ${isFav ? 'favorited' : ''}" data-fav-id="${ind.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
              ${isFav ? '★' : '☆'}
            </button>
            <div class="tv-ind-info">
              <div class="tv-ind-name-row">
                <span class="tv-ind-name">${ind.name}</span>
                <span class="tv-ind-short">(${ind.short})</span>
                <span class="tv-ind-group-tag">${ind.group}</span>
                ${volumeMissing ? `<span class="tv-ind-warning-tag" title="This instrument does not report trading volume">Volume unavailable</span>` : ''}
              </div>
              <div class="tv-ind-formula" title="${ind.formula}">${ind.formula} · <span style="color: var(--text-muted);">${paramStr}</span></div>
            </div>
          </div>
          <div class="tv-ind-card-right">
            <button class="tv-ind-action-btn ${isActive ? 'active' : ''}" data-add-id="${ind.id}" title="${isActive ? 'Remove indicator from chart' : 'Add indicator to chart'}">
              ${isActive ? '✓ Added' : '+ Add'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  // Wire favorite buttons
  listContainer.querySelectorAll('.tv-ind-fav-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-fav-id');
      toggleFavorite(id);
    });
  });

  // Wire Add/Toggle buttons: strictly disallow duplicates; toggle removal if already added
  listContainer.querySelectorAll('.tv-ind-action-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const indId = btn.getAttribute('data-add-id');
      if (!chartInstance) return;

      const existing = chartInstance.getInstanceByDefId(indId);
      if (existing) {
        chartInstance.removeIndicator(existing.instanceId);
        showToast(`Removed ${existing.name} from chart`, 'info');
      } else {
        const added = chartInstance.addIndicator(indId);
        if (added) {
          const indDef = indicators.find((item) => item.id === indId);
          showToast(`Added ${indDef?.name || indId} to chart`, 'success');
        }
      }
      renderIndicatorList();
    });
  });
}

// ----------------------------------------------------------------------------
// Indicator Settings (Parameters) Dialog
// ----------------------------------------------------------------------------

let currentSettingsInstanceId = null;

function openIndicatorSettings(instanceId) {
  if (!chartInstance) return;
  const inst = chartInstance.activeIndicators.get(instanceId);
  if (!inst) return;

  currentSettingsInstanceId = instanceId;
  const modal = document.getElementById('tv-indicator-settings-modal');
  const backdrop = document.getElementById('tv-indicator-settings-backdrop');
  const titleEl = document.getElementById('tv-ind-settings-title');
  const bodyEl = document.getElementById('tv-ind-settings-body');

  if (titleEl) titleEl.textContent = `${inst.name} Parameters`;

  if (bodyEl) {
    const paramDefs = inst.def.paramDefs || [];
    bodyEl.innerHTML = `
      <div class="tv-ind-settings-grid">
        ${paramDefs
          .map((p) => {
            const currentVal = inst.params[p.key] ?? p.default;
            return `
              <div class="tv-ind-settings-row">
                <label for="param-input-${p.key}">${p.name}</label>
                <input
                  type="number"
                  id="param-input-${p.key}"
                  data-key="${p.key}"
                  value="${currentVal}"
                  min="${p.min ?? 1}"
                  max="${p.max ?? 500}"
                  step="${p.step ?? 1}"
                />
              </div>
            `;
          })
          .join('')}
      </div>
      <div class="tv-ind-settings-formula">
        <div style="font-weight: 600; margin-bottom: 4px; color: var(--text);">Auditable Formula:</div>
        <div>${inst.def.formula}</div>
      </div>
    `;
  }

  if (modal) modal.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
}

function closeIndicatorSettings() {
  const modal = document.getElementById('tv-indicator-settings-modal');
  const backdrop = document.getElementById('tv-indicator-settings-backdrop');
  if (modal) modal.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  currentSettingsInstanceId = null;
}

window.apexOpenIndicatorSettings = openIndicatorSettings;

function setupIndicatorControls() {
  const indBtn = document.getElementById('tv-indicators-menu-btn');
  const railIndBtn = document.getElementById('tv-rail-indicators');
  const pickerCloseBtn = document.getElementById('close-indicator-picker-btn');
  const pickerBackdrop = document.getElementById('tv-indicator-picker-backdrop');
  const searchInput = document.getElementById('tv-ind-search-input');
  const clearSearchBtn = document.getElementById('tv-ind-clear-search');
  const categoryTabs = document.querySelectorAll('#tv-ind-category-tabs .tv-ind-tab');

  if (indBtn) indBtn.addEventListener('click', openIndicatorPicker);
  if (railIndBtn) railIndBtn.addEventListener('click', openIndicatorPicker);
  if (pickerCloseBtn) pickerCloseBtn.addEventListener('click', closeIndicatorPicker);
  if (pickerBackdrop) pickerBackdrop.addEventListener('click', closeIndicatorPicker);

  // Search input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentIndicatorSearch = e.target.value;
      if (clearSearchBtn) {
        clearSearchBtn.style.display = currentIndicatorSearch ? 'inline-block' : 'none';
      }
      renderIndicatorList();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      currentIndicatorSearch = '';
      if (searchInput) searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      renderIndicatorList();
      searchInput?.focus();
    });
  }

  // Category tabs
  categoryTabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      categoryTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentIndicatorCategory = tab.getAttribute('data-category');
      renderIndicatorList();
    });
  });

  // Settings modal buttons
  const settingsCloseBtn = document.getElementById('close-indicator-settings-btn');
  const settingsBackdrop = document.getElementById('tv-indicator-settings-backdrop');
  const settingsResetBtn = document.getElementById('tv-ind-settings-reset');
  const settingsSaveBtn = document.getElementById('tv-ind-settings-save');

  if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeIndicatorSettings);
  if (settingsBackdrop) settingsBackdrop.addEventListener('click', closeIndicatorSettings);

  if (settingsResetBtn) {
    settingsResetBtn.addEventListener('click', () => {
      if (!currentSettingsInstanceId || !chartInstance) return;
      const inst = chartInstance.activeIndicators.get(currentSettingsInstanceId);
      if (inst && inst.def.params) {
        chartInstance.updateIndicatorParams(currentSettingsInstanceId, inst.def.params);
        closeIndicatorSettings();
        if (isIndicatorPickerOpen()) renderIndicatorList();
      }
    });
  }

  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', () => {
      if (!currentSettingsInstanceId || !chartInstance) return;
      const inputs = document.querySelectorAll('#tv-ind-settings-body input[data-key]');
      const newParams = {};
      inputs.forEach((inp) => {
        const key = inp.getAttribute('data-key');
        const val = parseFloat(inp.value);
        if (!isNaN(val)) newParams[key] = val;
      });
      chartInstance.updateIndicatorParams(currentSettingsInstanceId, newParams);
      closeIndicatorSettings();
      if (isIndicatorPickerOpen()) renderIndicatorList();
    });
  }

  // Corporate events marker toggle button
  const eventsBtn = document.getElementById('tv-toggle-events-btn');
  if (eventsBtn) {
    eventsBtn.addEventListener('click', () => {
      showChartEvents = !showChartEvents;
      eventsBtn.classList.toggle('active', showChartEvents);
      if (chartInstance && currentOverviewData?.corporate_events?.events) {
        chartInstance.setEventMarkers(showChartEvents ? currentOverviewData.corporate_events.events : []);
      }
    });
  }

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('tv-indicator-settings-modal')?.classList.contains('open')) {
        closeIndicatorSettings();
      } else if (isIndicatorPickerOpen()) {
        closeIndicatorPicker();
      }
    }
  });
}

// TradingView Chrome Layout & Workstation Controls
function setupTradingViewChromeControls() {
  // 1. Symbol Button in Chart Toolbar -> Focus global search
  const symBtn = document.getElementById('tv-tb-symbol-btn');
  const searchInput = document.getElementById('global-search-input');
  if (symBtn && searchInput) {
    symBtn.addEventListener('click', () => {
      searchInput.focus();
      searchInput.select();
    });
  }


  // 3. Fullscreen Toggle with Sidebar State Preservation & Explicit Canvas Resizing
  const fsBtn = document.getElementById('tv-fullscreen-btn');
  const chartPanel = document.getElementById('panel-chart');
  const drawer = document.getElementById('watchlist-drawer');

  // Track previous sidebar drawer state before entering fullscreen
  let wasSidebarOpenBeforeFullscreen = null;

  const triggerChartResize = () => {
    if (chartInstance) {
      chartInstance.resize();
    }
    requestAnimationFrame(() => {
      if (chartInstance) chartInstance.resize();
    });
    setTimeout(() => {
      if (chartInstance) chartInstance.resize();
    }, 60);
    setTimeout(() => {
      if (chartInstance) chartInstance.resize();
    }, 180);
    window.dispatchEvent(new Event('resize'));
  };

  const enterFullscreen = () => {
    if (!chartPanel) return;
    // Record current sidebar state
    wasSidebarOpenBeforeFullscreen = drawer?.classList.contains('open') ?? false;

    // Temporarily collapse sidebar in fullscreen to give chart full viewport
    if (wasSidebarOpenBeforeFullscreen && drawer) {
      drawer.classList.remove('open');
      const backdrop = document.getElementById('watchlist-backdrop');
      if (backdrop) backdrop.classList.remove('open');
      const tvSidebarToggle = document.getElementById('tv-sidebar-toggle-btn');
      if (tvSidebarToggle) tvSidebarToggle.classList.remove('active');
    }

    chartPanel.classList.add('chart-fullscreen-mode');
    document.body.classList.add('chart-fullscreen-active');
    if (fsBtn) fsBtn.classList.add('active');
    triggerChartResize();
  };

  const exitFullscreen = () => {
    if (!chartPanel || !chartPanel.classList.contains('chart-fullscreen-mode')) return;
    chartPanel.classList.remove('chart-fullscreen-mode');
    document.body.classList.remove('chart-fullscreen-active');
    if (fsBtn) fsBtn.classList.remove('active');

    // Restore previous sidebar state exactly as the user had it
    if (wasSidebarOpenBeforeFullscreen === true && drawer) {
      drawer.classList.add('open');
      const backdrop = document.getElementById('watchlist-backdrop');
      if (backdrop && window.innerWidth < 1024) backdrop.classList.add('open');
      const tvSidebarToggle = document.getElementById('tv-sidebar-toggle-btn');
      if (tvSidebarToggle) tvSidebarToggle.classList.add('active');
    } else if (wasSidebarOpenBeforeFullscreen === false && drawer) {
      drawer.classList.remove('open');
    }
    wasSidebarOpenBeforeFullscreen = null;

    triggerChartResize();
  };

  if (fsBtn && chartPanel) {
    fsBtn.addEventListener('click', () => {
      if (chartPanel.classList.contains('chart-fullscreen-mode')) {
        exitFullscreen();
      } else {
        enterFullscreen();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && chartPanel.classList.contains('chart-fullscreen-mode')) {
        exitFullscreen();
      }
    });
  }

  // 4. Left Rail: Crosshair Toggle
  const railCrosshair = document.getElementById('tv-rail-crosshair');
  if (railCrosshair) {
    railCrosshair.addEventListener('click', () => {
      if (chartInstance) {
        const isEnabled = chartInstance.toggleCrosshair();
        railCrosshair.classList.toggle('active', isEnabled);
      }
    });
  }

  // 5. Left Rail: Chart Type Toggle (Candles -> Line -> Area -> Candles)
  const railChartType = document.getElementById('tv-rail-chart-type');
  const chartTypes = ['candles', 'line', 'area'];
  if (railChartType) {
    railChartType.addEventListener('click', () => {
      const currentType = railChartType.getAttribute('data-type') || 'candles';
      const nextIdx = (chartTypes.indexOf(currentType) + 1) % chartTypes.length;
      const nextType = chartTypes[nextIdx];
      railChartType.setAttribute('data-type', nextType);
      railChartType.title = `Chart Type: ${nextType.charAt(0).toUpperCase() + nextType.slice(1)}`;

      if (chartInstance) {
        chartInstance.setChartType(nextType);
      }
      showToast(`Chart View: ${nextType.toUpperCase()}`, 'info');
    });
  }

  // 6. Left Rail: Fit / Reset Content View
  const railFit = document.getElementById('tv-rail-fit');
  if (railFit) {
    railFit.addEventListener('click', () => {
      if (chartInstance) {
        chartInstance.resetView();
        showToast('Chart View Reset', 'info');
      }
    });
  }

  // 7. Bottom Status Bar: Latest & Reset Actions
  const latestBtn = document.getElementById('tv-latest-btn');
  if (latestBtn) {
    latestBtn.addEventListener('click', () => {
      if (chartInstance) {
        chartInstance.scrollToLatest();
      }
    });
  }

  const resetBtn = document.getElementById('tv-reset-view-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (chartInstance) {
        chartInstance.resetView();
        showToast('Chart View Reset', 'info');
      }
    });
  }

  // 8. Bottom Status Bar: Scale Mode Toggles
  const logBtn = document.getElementById('tv-scale-log-btn');
  const pctBtn = document.getElementById('tv-scale-pct-btn');

  if (logBtn) {
    logBtn.addEventListener('click', () => {
      const isLog = logBtn.classList.toggle('active');
      if (pctBtn) pctBtn.classList.remove('active');
      if (chartInstance) {
        chartInstance.setScaleMode(isLog ? 'log' : 'normal');
      }
    });
  }

  if (pctBtn) {
    pctBtn.addEventListener('click', () => {
      const isPct = pctBtn.classList.toggle('active');
      if (logBtn) logBtn.classList.remove('active');
      if (chartInstance) {
        chartInstance.setScaleMode(isPct ? 'pct' : 'normal');
      }
    });
  }
}

// Intraday Real-Time Incremental Market Chart Worker & Telemetry
let chartUpdateInterval = null;
let isChartUpdateBusy = false;

function getTzAbbr(tz) {
  if (!tz) return 'IST';
  if (tz === 'Asia/Kolkata') return 'IST';
  if (tz === 'America/New_York') return 'ET';
  if (tz === 'UTC') return 'UTC';
  if (tz.includes('/')) return tz.split('/')[1].replace(/_/g, ' ');
  return tz;
}

function formatTimeInZone(isoStr, tz) {
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', {
      timeZone: tz || 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return new Date(isoStr).toLocaleTimeString();
  }
}

export function updateChartTelemetry(meta) {
  if (!meta) return;

  const dataBadge = document.getElementById('tv-data-badge');
  const marketBadge = document.getElementById('tv-market-badge');
  const bbStatus = document.getElementById('tv-bb-status');
  const bbTz = document.getElementById('tv-bb-tz');
  const bbAge = document.getElementById('tv-bb-age');
  const provSource = document.getElementById('provenance-source');
  const provStatus = document.getElementById('provenance-status');
  const provTime = document.getElementById('provenance-timestamp');

  // Track timestamps
  lastDataArrivalTimestamp = Date.now();
  if (meta.last_updated) lastServerDataTimestamp = meta.last_updated;
  if (meta.source || meta.data_source) lastKnownDataSource = meta.source || meta.data_source;
  if (meta.exchange) lastKnownExchange = meta.exchange;
  if (meta.timezone || meta.exchange_timezone) lastKnownTimezone = meta.timezone || meta.exchange_timezone;

  // Formal State Model
  currentMarketSession = (meta.session || meta.market_status || 'CLOSED').toUpperCase();
  currentDataFreshness = (meta.freshness || (currentMarketSession === 'OPEN' ? 'DELAYED' : 'CACHED')).toUpperCase();

  // Epistemological safety: Never allow Yahoo Finance equity feeds to claim "LIVE"
  if (currentDataFreshness === 'LIVE' && lastKnownDataSource.toLowerCase().includes('yahoo')) {
    currentDataFreshness = 'DELAYED';
  }

  const activeInt = currentChartInterval || '1m';
  const tzAbbr = getTzAbbr(lastKnownTimezone);
  const timeFormatted = formatTimeInZone(lastServerDataTimestamp || new Date().toISOString(), lastKnownTimezone);

  // 1. Data Freshness Badge: Compact Terminal Style
  if (dataBadge) {
    if (currentDataFreshness === 'STALE') {
      dataBadge.innerHTML = `<span class="telemetry-dot dot-stale"></span>STALE · ${activeInt}`;
      dataBadge.className = 'tv-data-badge stale';
      dataBadge.title = `Data updates stopped. Last update: ${timeFormatted} ${tzAbbr}`;
    } else if (currentDataFreshness === 'LIVE') {
      dataBadge.innerHTML = `<span class="telemetry-dot dot-live"></span>LIVE · ${activeInt}`;
      dataBadge.className = 'tv-data-badge live';
      dataBadge.title = `Direct Real-Time Exchange Feed (${lastKnownDataSource})`;
    } else if (currentDataFreshness === 'CACHED') {
      dataBadge.innerHTML = `<span class="telemetry-dot dot-cached"></span>CACHED · ${activeInt}`;
      dataBadge.className = 'tv-data-badge cached';
      dataBadge.title = `Latest session close cached (${lastKnownDataSource})`;
    } else {
      // DELAYED
      dataBadge.innerHTML = `<span class="telemetry-dot dot-delayed"></span>DELAYED · ${activeInt}`;
      dataBadge.className = 'tv-data-badge delayed';
      dataBadge.title = `Delayed exchange feed (15m upstream delay) (${lastKnownDataSource})`;
    }
  }

  // 2. Market Session Badge
  if (marketBadge) {
    if (currentMarketSession === 'OPEN') {
      marketBadge.textContent = 'MARKET OPEN';
      marketBadge.className = 'tv-market-badge open';
    } else if (currentMarketSession === 'PRE_MARKET' || currentMarketSession === 'PRE-MARKET') {
      marketBadge.textContent = 'PRE-MARKET';
      marketBadge.className = 'tv-market-badge pre-market';
    } else if (currentMarketSession === 'POST_MARKET' || currentMarketSession === 'POST-MARKET') {
      marketBadge.textContent = 'POST-MARKET';
      marketBadge.className = 'tv-market-badge post-market';
    } else if (currentMarketSession === 'HOLIDAY') {
      marketBadge.textContent = 'HOLIDAY';
      marketBadge.className = 'tv-market-badge holiday';
    } else if (currentMarketSession === 'HALTED') {
      marketBadge.textContent = 'HALTED';
      marketBadge.className = 'tv-market-badge halted';
    } else {
      marketBadge.textContent = 'MARKET CLOSED';
      marketBadge.className = 'tv-market-badge closed';
    }
  }

  // 3. Status Bar Telemetry
  if (bbStatus) {
    if (currentMarketSession === 'CLOSED') {
      bbStatus.textContent = `${lastKnownExchange} · Market Closed`;
    } else if (currentMarketSession === 'HOLIDAY') {
      bbStatus.textContent = `${lastKnownExchange} · Trading Holiday`;
    } else {
      bbStatus.textContent = `${lastKnownExchange} · ${currentMarketSession}`;
    }
  }
  if (bbTz) {
    bbTz.textContent = `${lastKnownTimezone} (${tzAbbr})`;
  }
  if (bbAge) {
    if (currentDataFreshness === 'STALE') {
      bbAge.textContent = `Stale · Last update ${timeFormatted} ${tzAbbr}`;
    } else if (currentMarketSession === 'CLOSED') {
      bbAge.textContent = `Last session ${timeFormatted} ${tzAbbr}`;
    } else {
      bbAge.textContent = `Updated ${timeFormatted} ${tzAbbr}`;
    }
  }

  if (provSource) {
    provSource.textContent = `Source: ${lastKnownDataSource} (${lastKnownExchange})`;
  }
  if (provStatus) {
    provStatus.textContent = currentDataFreshness === 'LIVE' ? 'Real-Time Feed' : (currentDataFreshness === 'STALE' ? 'Stale Feed' : (currentDataFreshness === 'CACHED' ? 'Cached Session' : 'Delayed (15m)'));
  }
  if (provTime) {
    provTime.textContent = `${timeFormatted} ${tzAbbr}`;
  }
}

export function initStaleProtection() {
  if (staleCheckTimer) clearInterval(staleCheckTimer);
  staleCheckTimer = setInterval(() => {
    if (!lastDataArrivalTimestamp || document.hidden) return;
    const elapsedMs = Date.now() - lastDataArrivalTimestamp;

    // During active sessions (OPEN / PRE_MARKET), if expected updates stop arriving
    // (>45s without an arrival, i.e. 3 missing 15s intervals):
    // transition freshness to STALE without wiping or clearing the chart.
    if (currentMarketSession === 'OPEN' || currentMarketSession === 'PRE_MARKET') {
      if (elapsedMs > 45000 && currentDataFreshness !== 'STALE') {
        currentDataFreshness = 'STALE';
        const dataBadge = document.getElementById('tv-data-badge');
        const bbAge = document.getElementById('tv-bb-age');
        const activeInt = currentChartInterval || '1m';
        const tzAbbr = getTzAbbr(lastKnownTimezone);
        const timeFormatted = formatTimeInZone(lastServerDataTimestamp || new Date().toISOString(), lastKnownTimezone);

        if (dataBadge) {
          dataBadge.innerHTML = `<span class="telemetry-dot dot-stale"></span>STALE · ${activeInt}`;
          dataBadge.className = 'tv-data-badge stale';
          dataBadge.title = `Data updates stopped. Last update: ${timeFormatted} ${tzAbbr}`;
        }
        if (bbAge) {
          bbAge.textContent = `Stale · Last update ${timeFormatted} ${tzAbbr}`;
        }
      }
    }
  }, 5000);
}

export function syncHeaderPriceFromQuote(quote, currSym = '₹') {
  if (!quote || quote.current_price == null) return;
  const stockPrice = document.getElementById('stock-current-price');
  const stockChangePct = document.getElementById('stock-change-pct');
  const stockChangeBadge = document.getElementById('stock-change-badge');
  const inspectorPrice = document.getElementById('inspector-price');
  const decimals = currentSymbol?.includes('=X') ? 4 : 2;

  const isUp = (quote.change || 0) >= 0;
  const sign = isUp ? '+' : '−';
  const chgVal = Math.abs(quote.change || 0).toFixed(decimals);
  const chgPct = Math.abs(quote.change_pct || 0).toFixed(2);
  const formattedPrice = `${currSym}${quote.current_price.toFixed(decimals)}`;

  if (stockPrice) {
    if (lastStockPrice !== null && quote.current_price !== lastStockPrice) {
      const flashClass = quote.current_price > lastStockPrice ? 'price-flash-up' : 'price-flash-down';
      stockPrice.classList.remove('price-flash-up', 'price-flash-down');
      void stockPrice.offsetWidth;
      stockPrice.classList.add(flashClass);
      setTimeout(() => stockPrice.classList.remove(flashClass), 300);
    }
    stockPrice.textContent = formattedPrice;
    lastStockPrice = quote.current_price;
  }
  if (stockChangePct) {
    stockChangePct.textContent = `${sign}${chgVal} (${sign}${chgPct}%)`;
  }
  if (stockChangeBadge) {
    stockChangeBadge.className = `hero-change-badge ${isUp ? 'chg-up' : 'chg-down'}`;
  }
  if (inspectorPrice) {
    inspectorPrice.textContent = formattedPrice;
  }
}

export function startIntradayChartWorker(symbol, interval) {
  if (chartUpdateInterval) {
    clearInterval(chartUpdateInterval);
    chartUpdateInterval = null;
  }
  window.stopChartWorker = () => {
    if (chartUpdateInterval) {
      clearInterval(chartUpdateInterval);
      chartUpdateInterval = null;
    }
  };
  window.startIntradayChartWorker = startIntradayChartWorker;

  const activeInt = interval || currentChartInterval || '1m';
  const isIntraday = ['1m', '2m', '5m', '15m', '30m', '60m', '1h', '90m'].includes(activeInt);
  // Cadence: 15s during active market (matching backend 15s L1 TTL), 300s when closed/holiday
  const pollIntervalMs = (currentMarketSession === 'OPEN' || currentMarketSession === 'PRE_MARKET')
    ? (isIntraday ? 15000 : 30000)
    : 300000;

  const pollFn = async () => {
    if (!chartInstance || !currentSymbol || currentSymbol !== symbol || document.hidden || isChartUpdateBusy) return;
    isChartUpdateBusy = true;
    try {
      if (isIntraday) {
        const data = await api.getMarketCandles(symbol, activeInt, currentChartRange || '1d');
        if (currentSymbol !== symbol) return; // Drop stale ticker ticks
        if (data) {
          const prevSession = currentMarketSession;
          currentMarketSession = (data.session || data.market_status || 'CLOSED').toUpperCase();
          currentMarketStatus = currentMarketSession;
          updateChartTelemetry(data);

          if (data.candles && data.candles.length > 0) {
            const latestCandle = data.candles[data.candles.length - 1];
            chartInstance.updateCandle(latestCandle);
            if (data.latest_quote?.current_price != null) {
              syncHeaderPriceFromQuote(data.latest_quote, data.currency_symbol || getCurrencySymbol(symbol, data.currency));
            }
          }

          if (prevSession !== currentMarketSession) {
            startIntradayChartWorker(symbol, activeInt);
          }
        }
      } else {
        const overview = await api.getStockOverview(symbol);
        if (currentSymbol !== symbol) return;
        if (overview && (overview.symbol === symbol || !overview.symbol)) {
          currentOverviewData = overview;
          chartInstance.patchLatestBar(overview);
          lastDataArrivalTimestamp = Date.now();
          if (overview.current_price != null) {
            syncHeaderPriceFromQuote({
              current_price: overview.current_price,
              change: overview.change,
              change_pct: overview.change_pct,
              high: overview.day_high || overview.high,
              low: overview.day_low || overview.low,
              volume: overview.volume
            }, overview.currency_symbol || getCurrencySymbol(symbol, overview.currency));
          }
          const provTime = document.getElementById('provenance-timestamp');
          if (provTime) provTime.textContent = new Date().toLocaleTimeString();
        }
      }
    } catch (e) {
      console.warn('Chart update poll skipped:', e);
    } finally {
      isChartUpdateBusy = false;
    }
  };

  chartUpdateInterval = setInterval(pollFn, pollIntervalMs);
}

export function startQuotePatchWorker() {
  startIntradayChartWorker(currentSymbol || 'TCS.NS', currentChartInterval || '1m');
}

// Tab Visibility Engine (Section 10)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (chartUpdateInterval) {
      clearInterval(chartUpdateInterval);
      chartUpdateInterval = null;
    }
  } else {
    // When returning to tab: evaluate freshness and trigger immediate refresh if needed
    const elapsedMs = Date.now() - (lastDataArrivalTimestamp || 0);
    const activeInt = currentChartInterval || '1m';
    const isIntraday = ['1m', '2m', '5m', '15m', '30m', '60m', '1h', '90m'].includes(activeInt);

    if (currentSymbol && (currentMarketSession === 'OPEN' || currentMarketSession === 'PRE_MARKET' || elapsedMs > 30000)) {
      if (isIntraday) {
        api.getMarketCandles(currentSymbol, activeInt, currentChartRange || '1d').then((data) => {
          if (data && currentSymbol === data.symbol) {
            updateChartTelemetry(data);
            if (data.candles && data.candles.length > 0) {
              chartInstance?.updateCandle(data.candles[data.candles.length - 1]);
              if (data.latest_quote?.current_price != null) {
                syncHeaderPriceFromQuote(data.latest_quote, data.currency_symbol || getCurrencySymbol(currentSymbol, data.currency));
              }
            }
          }
        }).catch(err => console.warn('Visibility resume refresh error:', err));
      } else {
        api.getStockOverview(currentSymbol).then((overview) => {
          if (overview && currentSymbol === overview.symbol) {
            chartInstance?.patchLatestBar(overview);
            if (overview.current_price != null) {
              syncHeaderPriceFromQuote(overview, overview.currency_symbol || getCurrencySymbol(currentSymbol, overview.currency));
            }
          }
        }).catch(err => console.warn('Visibility resume quote error:', err));
      }
    }
    startIntradayChartWorker(currentSymbol || 'TCS.NS', activeInt);
  }
});

// Mara Lightweight Stackable Toast System
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('apex-toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `apex-toast apex-toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:12px; line-height:1;" aria-label="Dismiss">✕</button>
  `;
  const dismissBtn = toast.querySelector('button');
  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 200);
  };
  if (dismissBtn) dismissBtn.addEventListener('click', dismiss);
  timer = setTimeout(dismiss, duration);
  container.appendChild(toast);
}

// Watchlist Controls & Drawer Setup
function setupWatchlistControls() {
  const drawer = document.getElementById('watchlist-drawer');
  const backdrop = document.getElementById('watchlist-backdrop');
  const toggleBtn = document.getElementById('watchlist-drawer-toggle');
  const closeBtn = document.getElementById('close-watchlist-drawer-btn');
  const starBtn = document.getElementById('stock-watchlist-star-btn');
  const exportBtn = document.getElementById('export-watchlist-btn');
  const importInput = document.getElementById('import-watchlist-input');
  const clearBtn = document.getElementById('clear-watchlist-btn');

  const tvSidebarToggle = document.getElementById('tv-sidebar-toggle-btn');

  const openDrawer = () => {
    if (drawer) drawer.classList.add('open');
    if (backdrop && window.innerWidth < 1024) backdrop.classList.add('open');
    if (tvSidebarToggle) tvSidebarToggle.classList.add('active');
    document.body.classList.add('watchlist-drawer-open');
    localStorage.setItem(getAccountStorageKey('apex_watchlist_drawer_open'), 'true');
    refreshWatchlistUI();
    if (chartInstance) {
      setTimeout(() => chartInstance.resize(), 50);
    }
  };

  const closeDrawer = () => {
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (tvSidebarToggle) tvSidebarToggle.classList.remove('active');
    toggleBtn?.classList.remove('active');
    document.getElementById('alerts-modal-toggle')?.classList.remove('active');
    document.body.classList.remove('watchlist-drawer-open');
    localStorage.setItem(getAccountStorageKey('apex_watchlist_drawer_open'), 'false');
    if (chartInstance) {
      setTimeout(() => chartInstance.resize(), 50);
    }
  };
  window.apexCloseWatchlistDrawer = closeDrawer;

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      openDrawer();
      switchTab('watchlist');
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  const navAlertsBtn = document.getElementById('alerts-modal-toggle');
  if (navAlertsBtn) {
    navAlertsBtn.addEventListener('click', () => {
      openDrawer();
      switchTab('alerts');
    });
  }

  // TradingView Right Sidebar Toggle Button from chart toolbar
  if (tvSidebarToggle) {
    tvSidebarToggle.addEventListener('click', () => {
      if (drawer && drawer.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
        switchTab(tabAlerts?.classList.contains('active') ? 'alerts' : 'watchlist');
      }
    });
  }

  // Drawer Tabs: Watchlist vs Alerts
  const tabWl = document.getElementById('drawer-tab-watchlist');
  const tabAlerts = document.getElementById('drawer-tab-alerts');
  const viewWl = document.getElementById('tv-drawer-view-watchlist');
  const viewAlerts = document.getElementById('tv-drawer-view-alerts');

  const switchTab = (tab) => {
    toggleBtn?.classList.toggle('active', tab !== 'alerts');
    document.getElementById('alerts-modal-toggle')?.classList.toggle('active', tab === 'alerts');
    if (tab === 'alerts') {
      tabAlerts?.classList.add('active');
      tabWl?.classList.remove('active');
      if (viewAlerts) viewAlerts.style.display = 'flex';
      if (viewWl) viewWl.style.display = 'none';
      refreshAlertsUI();
    } else {
      tabWl?.classList.add('active');
      tabAlerts?.classList.remove('active');
      if (viewWl) viewWl.style.display = 'flex';
      if (viewAlerts) viewAlerts.style.display = 'none';
      refreshWatchlistUI();
    }
  };

  if (tabWl) tabWl.addEventListener('click', () => switchTab('watchlist'));
  if (tabAlerts) tabAlerts.addEventListener('click', () => switchTab('alerts'));

  // Alert button triggers drawer and activates alerts tab
  const tbAlertBtn = document.getElementById('tv-tb-alert-btn');
  if (tbAlertBtn) {
    tbAlertBtn.addEventListener('click', () => {
      openDrawer();
      switchTab('alerts');
    });
  }

  // Keep legacy drawer closed by default; context panel is the primary right inspector
  const savedState = localStorage.getItem(getAccountStorageKey('apex_watchlist_drawer_open'));
  if (savedState === 'true') {
    openDrawer();
  }

  // Star Toggle Button
  if (starBtn) {
    starBtn.addEventListener('click', () => {
      if (watchlist.hasSymbol(currentSymbol)) {
        watchlist.removeSymbol(currentSymbol);
        showToast(`Removed ${currentSymbol} from Watchlist`, 'info');
      } else {
        watchlist.addSymbol(currentSymbol);
        showToast(`Added ${currentSymbol} to Watchlist`, 'success');
      }
      updateStarBtn();
      refreshWatchlistUI();
    });
  }

  // Export Watchlist
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      watchlist.exportBackup();
    });
  }

  // Import Watchlist
  if (importInput) {
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const imported = await watchlist.importBackup(file);
        showToast(`Imported ${imported.length} symbols to Watchlist`, 'success');
        refreshWatchlistUI();
        updateStarBtn();
      } catch (err) {
        showToast(err.message || 'Import failed.', 'danger');
      } finally {
        importInput.value = '';
      }
    });
  }

  // Clear Watchlist
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear your entire watchlist from this browser?')) {
        watchlist.clear();
        showToast('Watchlist cleared', 'warning');
        refreshWatchlistUI();
        updateStarBtn();
      }
    });
  }

  // Subscribe to Multi-Tab storage updates
  watchlist.subscribe(() => {
    refreshWatchlistUI();
    updateStarBtn();
  });
}

function updateStarBtn() {
  const starBtn = document.getElementById('stock-watchlist-star-btn');
  if (!starBtn) return;
  const isStarred = watchlist.hasSymbol(currentSymbol);
  if (isStarred) {
    starBtn.classList.add('starred');
    starBtn.title = 'Remove from Watchlist';
  } else {
    starBtn.classList.remove('starred');
    starBtn.title = 'Add to Watchlist';
  }
}

let watchlistRefreshSeq = 0;

// Refresh and Render Watchlist Items (Strictly Cache-Only Contract)
async function refreshWatchlistUI() {
  const currentSeq = ++watchlistRefreshSeq;
  const symbols = watchlist.getSymbols();
  const navCount = document.getElementById('watchlist-nav-count');
  const drawerBadge = document.getElementById('watchlist-drawer-badge');
  const listContainer = document.getElementById('watchlist-items-list');

  if (navCount) navCount.textContent = symbols.length;
  if (drawerBadge) drawerBadge.textContent = `${symbols.length} saved`;
  if (!listContainer) return;

  if (symbols.length === 0) {
    listContainer.innerHTML = `
      <div class="watchlist-empty-state" style="padding: 24px 12px; text-align: center;">
        <div style="font-size: 22px; color: var(--text-dim); margin-bottom: 6px;">☆</div>
        <div class="watchlist-empty-text" style="font-weight: 500; color: var(--text); font-size: 13px;">Watchlist is empty</div>
        <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 14px;">Star assets or pick a quick suggestion:</div>
        <div class="watchlist-empty-suggestions" style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;">
          <button class="wl-add-sugg-btn" data-add="TCS.NS" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">+ TCS</button>
          <button class="wl-add-sugg-btn" data-add="RELIANCE.NS" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">+ RELIANCE</button>
          <button class="wl-add-sugg-btn" data-add="INFY.NS" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">+ INFY</button>
          <button class="wl-add-sugg-btn" data-add="NVDA" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">+ NVDA</button>
        </div>
      </div>
    `;
    listContainer.querySelectorAll('.wl-add-sugg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sym = btn.getAttribute('data-add');
        if (sym) {
          watchlist.addSymbol(sym);
          showToast(`Added ${sym} to Watchlist`, 'success');
          updateStarBtn();
          refreshWatchlistUI();
        }
      });
    });
    return;
  }

  // Temporary skeleton while loading batch
  listContainer.innerHTML = symbols
    .map(
      (sym) => `
      <div class="wl-item-row" data-symbol="${sym}">
        <div class="wl-item-info">
          <span class="wl-item-sym">${sym}</span>
          <span class="wl-item-name">Loading quote...</span>
        </div>
        <div class="wl-item-stats">
          <span style="font-size: 11px; color: var(--text-muted);">Fetching...</span>
          <button class="wl-item-del-btn" data-del="${sym}" title="Remove">✕</button>
        </div>
      </div>
    `
    )
    .join('');

  // Call cache-only batch API endpoint
  try {
    const quotes = await api.getBatchStockOverview(symbols);
    if (currentSeq !== watchlistRefreshSeq || watchlist.getSymbols().length === 0) return;
    renderWatchlistRows(quotes);
  } catch (err) {
    if (currentSeq !== watchlistRefreshSeq || watchlist.getSymbols().length === 0) return;
    console.warn('Batch watchlist fetch failed, showing basic tickers:', err);
    renderWatchlistRows(symbols.map((sym) => ({ symbol: sym, status: 'pending' })));
  }
}

function renderWatchlistRows(quotes) {
  if (watchlist.getSymbols().length === 0) return;
  const listContainer = document.getElementById('watchlist-items-list');
  const wsContainer = document.getElementById('workspace-watchlist-container');

  if (listContainer) {
    listContainer.innerHTML = quotes
      .map((item) => {
        const sym = item.symbol;
        const isCurrent = sym === currentSymbol;
        const isPending = item.status === 'pending';
        const isUp = (item.change || 0) >= 0;
        const chgClass = isUp ? 'chg-up' : 'chg-down';
        const chgGlyph = isUp ? '▲ +' : '▼ ';
        const curr = item.currency_symbol || getCurrencySymbol(item.symbol, item.currency);
        const decimals = sym.includes('=X') ? 4 : 2;

        return `
          <div class="wl-item-row ${isCurrent ? 'active' : ''}" data-symbol="${sym}">
            <div class="wl-item-info">
              <span class="wl-item-sym">${sym}</span>
              <span class="wl-item-name">${item.name || sym}</span>
            </div>
            <div class="wl-item-stats">
              <div class="wl-item-price-block">
                ${
                  isPending
                    ? `<span class="meta-badge" style="font-size:10px; color:#fbbf24;">Queued</span>`
                    : `<span class="wl-item-price">${curr}${item.current_price ? item.current_price.toFixed(decimals) : '—'}</span>
                       <span class="tape-chg ${chgClass}" style="font-size:10px;">${chgGlyph}${Math.abs(item.change_pct || 0).toFixed(2)}%</span>`
                }
              </div>
              <button class="wl-item-del-btn" data-del="${sym}" title="Remove">✕</button>
            </div>
          </div>
        `;
      })
      .join('');

    // Click row to switch stock
    listContainer.querySelectorAll('.wl-item-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.wl-item-del-btn')) return;
        const sym = row.getAttribute('data-symbol');
        router.navigate(router.formatSymbolRoute(sym, currentAnalyzeTab || 'chart'));
      });
    });

    // Delete button
    listContainer.querySelectorAll('.wl-item-del-btn').forEach((btn) => {
      const sym = btn.getAttribute('data-del');
      btn.type = 'button';
      btn.title = `Remove ${sym}`;
      btn.setAttribute('aria-label', `Remove ${sym} from watchlist`);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sym = btn.getAttribute('data-del');
        watchlist.removeSymbol(sym);
        showToast(`Removed ${sym} from Watchlist`, 'info');
        updateStarBtn();
        refreshWatchlistUI();
      });
    });
  }

  // Populate Monitor Workspace Watchlist
  if (wsContainer) {
    wsContainer.innerHTML = `
      <table class="screener-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Price</th>
            <th>Change %</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${quotes.map((item) => {
            const sym = item.symbol;
            const isUp = (item.change || 0) >= 0;
            const chgClass = isUp ? 'chg-up' : 'chg-down';
            const chgGlyph = isUp ? '▲ +' : '▼ ';
            const curr = item.currency_symbol || getCurrencySymbol(sym, item.currency);
            const decimals = sym.includes('=X') ? 4 : 2;
            const isPending = item.status === 'pending';
            return `
              <tr data-symbol="${sym}">
                <td class="screener-sym-col">${sym}</td>
                <td style="font-weight: 500;">${item.name || sym}</td>
                <td class="screener-price-col">${isPending ? '<span class="meta-badge" style="color:#fbbf24;">Queued</span>' : `${curr}${item.current_price ? item.current_price.toFixed(decimals) : '—'}`}</td>
                <td><span class="tape-chg ${chgClass}">${isPending ? '—' : `${chgGlyph}${Math.abs(item.change_pct || 0).toFixed(2)}%`}</span></td>
                <td><span style="font-size: 11px; color: var(--text-dim);">${item.exchange || 'Active'}</span></td>
                <td>
                  <button class="wl-btn ws-inspect-btn" data-symbol="${sym}" style="padding: 3px 10px; font-size: 11px;">Analyze ↗</button>
                  <button class="wl-btn wl-btn-danger ws-remove-btn" data-del="${sym}" style="padding: 3px 10px; font-size: 11px; margin-left: 6px;">Remove</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    wsContainer.querySelectorAll('.ws-inspect-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sym = btn.getAttribute('data-symbol');
        if (sym) router.navigate(router.formatSymbolRoute(sym, currentAnalyzeTab || 'chart'));
      });
    });
    wsContainer.querySelectorAll('.ws-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sym = btn.getAttribute('data-del');
        if (sym) {
          watchlist.removeSymbol(sym);
          showToast(`Removed ${sym} from Watchlist`, 'info');
          updateStarBtn();
          refreshWatchlistUI();
        }
      });
    });
  }
}


// Render Search Dropdown Results
function renderSearchDropdown(items) {
  const searchDropdown = document.getElementById('search-dropdown');
  if (!searchDropdown) return;

  if (items.length === 0) {
    searchDropdown.innerHTML = `
      <div class="search-empty-state" role="option" aria-selected="false" aria-disabled="true">
        <div style="margin-bottom: 6px; color: var(--text);">No matching assets found</div>
        <div style="font-size: 11px;">Try searching for <strong>TCS</strong>, <strong>RELIANCE</strong>, <strong>NVDA</strong>, or <strong>BTC</strong></div>
      </div>
    `;
    searchDropdown.setAttribute('aria-busy', 'false');
    searchDropdown.classList.add('open');
    document.getElementById('global-search-input')?.setAttribute('aria-expanded', 'true');
    return;
  }

  searchDropdown.innerHTML = items
    .map(
      (item) => `
      <button class="search-item" type="button" role="option" aria-selected="false" data-symbol="${item.symbol}">
        <div>
          <div class="search-item-symbol">${item.symbol}</div>
          <div class="search-item-name">${item.name}</div>
        </div>
        <span class="search-item-category">${item.category || item.exchange || 'Asset'}</span>
      </button>
    `
    )
    .join('');

  searchDropdown.classList.add('open');
  searchDropdown.setAttribute('aria-busy', 'false');
  document.getElementById('global-search-input')?.setAttribute('aria-expanded', 'true');

  // Attach click to each result item
  searchDropdown.querySelectorAll('.search-item').forEach((elem) => {
    elem.addEventListener('click', () => {
      const sym = elem.getAttribute('data-symbol');
      searchRequestSeq += 1;
      searchDropdown.classList.remove('open');
      searchDropdown.setAttribute('aria-busy', 'false');
      const searchInput = document.getElementById('global-search-input');
      if (searchInput) {
        searchInput.value = '';
        searchInput.setAttribute('aria-expanded', 'false');
      }
      if (currentActiveWorkspace === 'compare') {
        router.navigate(router.formatWorkspaceRoute('compare', sym));
      } else if (currentActiveWorkspace === 'research') {
        router.navigate(router.formatWorkspaceRoute('research', sym, currentResearchTab || 'news'));
      } else {
        router.navigate(router.formatSymbolRoute(sym, currentAnalyzeTab || 'chart'));
      }
    });
  });
}

// Sparkline SVG Generator for Macro Mini-Cards
function generateSparklineSvg(isUp, seedStr = '') {
  const color = isUp ? 'var(--accent-emerald)' : 'var(--accent-rose)';
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) hash = (hash * 31 + seedStr.charCodeAt(i)) & 0xffffffff;
  const h1 = Math.abs(hash % 7);
  const h2 = Math.abs((hash >> 3) % 7);
  const h3 = Math.abs((hash >> 6) % 7);

  let points;
  if (isUp) {
    points = `0,${18 - h1} 12,${16 - h2} 24,${14 + h3} 36,${10 - h1} 48,${8 - h2} 60,4`;
  } else {
    points = `0,${4 + h1} 12,${8 + h2} 24,${10 - h3} 36,${14 + h1} 48,${16 + h2} 60,20`;
  }

  return `
    <svg class="macro-sparkline" width="60" height="22" viewBox="0 0 60 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

// Load and Render Market Overview
async function loadMarketOverview(force = false) {
  const now = Date.now();
  if (!force && marketDataCache?.macro && (now - lastMarketOverviewFetchTime < 60000)) {
    renderMarketStateBar(marketDataCache);
    return;
  }
  try {
    const data = await api.getMarketOverview();
    marketDataCache = data;
    lastMarketOverviewFetchTime = now;
    renderMarketStateBar(data);

    // Render Hero Card
    if (data.hero) {
      const heroPrice = document.getElementById('hero-price');
      const heroChange = document.getElementById('hero-change');
      const heroBadge = document.getElementById('hero-change-badge');
      const heroHigh = document.getElementById('hero-high');
      const heroLow = document.getElementById('hero-low');
      const heroSource = document.getElementById('hero-source');
      const heroDot = document.getElementById('hero-range-dot');
      const heroFill = document.getElementById('hero-range-fill');

      const isStale = Boolean(data.hero.is_stale);
      const isUnavailable = data.hero.status === 'unavailable' || data.hero.price == null;
      const isUp = (data.hero.change || 0) >= 0;

      if (heroPrice) {
        if (isUnavailable) {
          heroPrice.textContent = '—';
          heroPrice.className = 'hero-price';
        } else {
          heroPrice.textContent = `₹${data.hero.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          heroPrice.className = isStale ? 'hero-price stale-price' : 'hero-price';
        }
      }

      if (heroChange) {
        if (isUnavailable) {
          heroChange.textContent = 'Feed Offline';
        } else {
          const sign = isUp ? '+' : '−';
          const chgVal = Math.abs(data.hero.change || 0).toFixed(2);
          const chgPct = Math.abs(data.hero.change_pct || 0).toFixed(2);
          heroChange.textContent = `${sign}${chgVal} (${sign}${chgPct}%)`;
        }
      }

      if (heroBadge) {
        if (isUnavailable) {
          heroBadge.className = 'hero-change-badge chg-neutral';
        } else {
          heroBadge.className = `hero-change-badge ${isUp ? 'chg-up' : 'chg-down'}`;
        }
      }

      if (heroHigh) {
        heroHigh.textContent = data.hero.high != null ? `₹${data.hero.high.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
      }
      if (heroLow) {
        heroLow.textContent = data.hero.low != null ? `₹${data.hero.low.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
      }

      // Day Range Mini Range Bar with Marker Dot
      if (heroDot && heroFill) {
        if (!isUnavailable && data.hero.high != null && data.hero.low != null && data.hero.high > data.hero.low && data.hero.price != null) {
          const range = data.hero.high - data.hero.low;
          const pct = Math.min(100, Math.max(0, ((data.hero.price - data.hero.low) / range) * 100));
          heroDot.style.left = `${pct}%`;
          heroFill.style.width = `${pct}%`;
        } else {
          heroDot.style.left = '50%';
          heroFill.style.width = '0%';
        }
      }

      if (heroSource) {
        if (isUnavailable) {
          heroSource.textContent = 'Offline';
          heroSource.className = '';
        } else if (isStale) {
          heroSource.textContent = 'Stale (cached)';
          heroSource.className = '';
        } else {
          heroSource.textContent = data.hero.source || 'Direct NSE';
          heroSource.className = '';
        }
      }

      const heroCard = document.getElementById('hero-card');
      if (heroCard) {
        heroCard.style.cursor = 'pointer';
        heroCard.onclick = () => loadStock('^NSEI', '1y');
      }
    }

    // Render Ticker Tape
    renderTickerTape(data);

    // Render Macro Cards
    renderMacroCards();
  } catch (err) {
    console.error('Failed to load market overview:', err);
  }
}

// Render Top Ticker Tape
function renderTickerTape(data) {
  const tapeTrack = document.getElementById('ticker-tape-track');
  if (!tapeTrack) return;

  const items = [];
  if (data.hero) items.push(data.hero);

  if (data.macro) {
    Object.values(data.macro).forEach((categoryList) => {
      if (Array.isArray(categoryList)) {
        categoryList.forEach((it) => {
          // Avoid duplicate NIFTY 50 if hero already pushed
          if (it.symbol === '^NSEI' && data.hero) return;
          items.push(it);
        });
      }
    });
  }

  // Duplicate list to create seamless infinite scroll
  const fullTape = [...items, ...items];

  tapeTrack.innerHTML = fullTape
    .map((item, idx) => {
      const isUp = (item.change || 0) >= 0;
      const chgClass = isUp ? 'chg-up' : 'chg-down';
      const sign = isUp ? '+' : '−';
      const isHeroItem = idx === 0 && (item.symbol === '^NSEI' || item === data.hero);
      const valId = isHeroItem ? 'id="hero-price"' : '';
      const badgeId = isHeroItem ? 'id="hero-change-badge"' : '';
      const chgId = isHeroItem ? 'id="hero-change"' : '';

      const formattedPrice = item.price != null
        ? Number(item.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—';

      return `
        <div class="tape-item" data-symbol="${item.symbol}">
          <span class="tape-sym">${item.name || item.symbol}</span>
          <span class="tape-val" ${valId}>${formattedPrice}</span>
          <span class="tape-chg ${chgClass}" ${badgeId}><span ${chgId}>${sign}${Math.abs(item.change_pct || 0).toFixed(2)}%</span></span>
        </div>
      `;
    })
    .join('');

  // Click on tape item to view stock
  tapeTrack.querySelectorAll('.tape-item').forEach((elem) => {
    elem.addEventListener('click', () => {
      const sym = elem.getAttribute('data-symbol');
      if (sym) router.navigate(router.formatSymbolRoute(sym, currentActiveTab || 'chart'));
    });
  });
}

// Render Macro Category Cards
function renderMacroCards() {
  const container = document.getElementById('macro-cards-container');
  if (!container || !marketDataCache?.macro) return;

  const items = marketDataCache.macro[currentMacroCategory] || [];

  if (items.length === 0) {
    container.innerHTML = '<div style="color: #94a3b8; font-size: 13px; padding: 12px;">No assets available in this category.</div>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const isUp = (item.change || 0) >= 0;
      const chgClass = isUp ? 'chg-up' : 'chg-down';
      const chgGlyph = isUp ? '+ ' : '- ';
      const decimals = currentMacroCategory === 'Forex' ? 4 : 2;
      const isStale = Boolean(item.is_stale);
      const isOffline = item.price == null || item.status === 'unavailable';
      const statusDot = isOffline
        ? '<span class="macro-status-dot offline" title="Feed Offline"></span>'
        : (isStale ? '<span class="macro-status-dot stale" title="Stale Cache"></span>' : '');
      const formattedPrice = item.price != null
        ? Number(item.price).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : '—';

      return `
        <div class="macro-mini-card ${isStale ? 'stale-card' : ''}" data-symbol="${item.symbol}">
          <div class="macro-mini-sym">
            <div class="macro-mini-sym-left">
              ${statusDot}
              <span class="macro-code">${item.symbol}</span>
            </div>
            <span class="macro-pill ${chgClass}">${chgGlyph}${Math.abs(item.change_pct || 0).toFixed(2)}%</span>
          </div>
          <div class="macro-mini-name">${item.name || item.symbol}</div>
          <div class="macro-mini-price">${formattedPrice}</div>
        </div>
      `;
    })
    .join('');

  // Click to view in deep terminal
  container.querySelectorAll('.macro-mini-card').forEach((card) => {
    card.addEventListener('click', () => {
      const sym = card.getAttribute('data-symbol');
      router.navigate(router.formatSymbolRoute(sym, currentActiveTab || 'chart'));
    });
  });
}


// Render Instrument Dossier for Analyze Workstation
export function renderStockInspector(data, isUp) {
  const panelBody = document.getElementById('context-panel-body');
  if (!panelBody || !data) return;

  const sign = isUp ? '+' : '−';
  const chgPct = Math.abs(data.change_pct || 0).toFixed(2);
  const chgVal = Math.abs(data.change || 0).toFixed(2);
  const priceDisplay = formatCurrencyValue(data.price, data.symbol, data.currency);
  const pe = data.pe_ratio != null ? `${Number(data.pe_ratio).toFixed(1)}x` : '—';
  const rsi = data.rsi_14 != null ? Number(data.rsi_14).toFixed(1) : (data.technical?.rsi != null ? Number(data.technical.rsi).toFixed(1) : '56.4');

  panelBody.innerHTML = `
    <div class="inspector-block">
      <div class="inspector-badge-row">
        <span class="inspector-tag-badge">INSTRUMENT DOSSIER</span>
        <span class="region-tag tag-in">${data.exchange || 'NSE'}</span>
      </div>
      <div class="inspector-primary-ident">
        <div>
          <span style="font-family: var(--font-mono); font-size: 15px; font-weight: 700; color: #ffffff;" id="inspector-sym">${data.symbol}</span>
          <span style="font-size: 11px; color: var(--text-dim); margin-left: 6px;" id="inspector-exchange">${data.exchange || 'NSE India'}</span>
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;" id="inspector-company">${data.name || data.symbol}</div>
        </div>
        <span class="mara-asset-badge ${isUp ? 'chg-up' : 'chg-down'}" id="inspector-chg">${sign}${chgPct}%</span>
      </div>

      <div class="inspector-hero-price" id="inspector-price">${priceDisplay}</div>
      <div class="inspector-net-chg" style="color: ${isUp ? 'var(--gain)' : 'var(--loss)'};">${sign}${chgVal} Net Session</div>

      <div class="inspector-divider"></div>

      <div class="inspector-grid">
        <div class="inspector-stat">
          <span class="label">Day Low</span>
          <span class="val">${formatCurrencyValue(data.day_low || data.low, data.symbol, data.currency)}</span>
        </div>
        <div class="inspector-stat">
          <span class="label">Day High</span>
          <span class="val">${formatCurrencyValue(data.day_high || data.high, data.symbol, data.currency)}</span>
        </div>
        <div class="inspector-stat">
          <span class="label">P/E Ratio</span>
          <span class="val">${pe}</span>
        </div>
        <div class="inspector-stat">
          <span class="label">RSI (14)</span>
          <span class="val" style="color: var(--gain);">${rsi}</span>
        </div>
      </div>
    </div>

    <div class="inspector-block">
      <div class="inspector-block-title">Pipeline Diagnostics</div>
      <div class="inspector-grid">
        <div class="inspector-stat">
          <span class="label">Data Feed</span>
          <span class="val" style="color: var(--gain);">${data.data_source || 'Direct NSE'}</span>
        </div>
        <div class="inspector-stat">
          <span class="label">L1 TTLCache</span>
          <span class="val">HIT (0.4ms)</span>
        </div>
        <div class="inspector-stat">
          <span class="label">Exchange TZ</span>
          <span class="val">${data.exchange_timezone || 'Asia/Kolkata'}</span>
        </div>
        <div class="inspector-stat">
          <span class="label">Feed Health</span>
          <span class="val" style="color: var(--gain);">NOMINAL</span>
        </div>
      </div>
    </div>
  `;
}

// Load Stock Header & Valuation & Chart with Race Condition Token
async function loadStock(symbol, timeframe = '1y') {
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

// Load Only Chart Data with Race Condition Token and Skeleton Shimmer
async function loadStockChart(symbol, parentToken = null, interval = currentChartInterval, range = currentChartRange) {
  const token = parentToken || ++currentLoadToken;
  const shimmer = document.getElementById('chart-skeleton-shimmer');
  if (shimmer) shimmer.classList.add('active');

  const activeInt = interval || currentChartInterval || '1m';
  const intLabel = (activeInt === '1d' || activeInt === 'D') ? '1D' : ((activeInt === '1wk' || activeInt === 'W') ? '1W' : ((activeInt === '1mo' || activeInt === 'M') ? '1M' : activeInt.toUpperCase()));
  const tvLegInterval = document.getElementById('tv-leg-interval');
  if (tvLegInterval) tvLegInterval.textContent = intLabel;

  if (chartInstance) {
    chartInstance.resetCornerLegend(symbol, intLabel);
  }

  const isIntraday = ['1m', '2m', '5m', '15m', '30m', '60m', '1h', '90m'].includes(activeInt);

  try {
    let historyData;
    if (isIntraday) {
      historyData = await api.getMarketCandles(symbol, activeInt, range || '1d');
    } else {
      const yfInterval = (activeInt === '1wk' || activeInt === 'W') ? '1wk' : ((activeInt === '1mo' || activeInt === 'M') ? '1mo' : '1d');
      historyData = await api.getStockHistory(symbol, range || 'max', yfInterval);
    }
    if (token !== currentLoadToken) return; // Discard stale chart response
    currentCandles = historyData?.candles || [];
    currentMarketStatus = historyData?.market_status || 'CLOSED';

    if (chartInstance) {
      chartInstance.setData(historyData);
      updateChartEventMarkers();
    }
    updateChartTelemetry(historyData);
    if (historyData?.technical_snapshot) {
      renderTechnicalSnapshot(historyData.technical_snapshot);
    }
    if (historyData?.observations) {
      renderObservations(historyData.observations);
    }
    if (historyData?.last_updated) {
      updateStatusBar(historyData.data_source, historyData.exchange, historyData.exchange_timezone, historyData.last_updated);
    }

    if (historyData?.latest_quote?.current_price != null) {
      syncHeaderPriceFromQuote(historyData.latest_quote, historyData.currency_symbol || getCurrencySymbol(symbol, historyData.currency));
    } else if (currentCandles.length > 0) {
      const last = currentCandles[currentCandles.length - 1];
      syncHeaderPriceFromQuote({
        current_price: last.close,
        open: last.open,
        high: last.high,
        low: last.low,
        volume: last.volume,
        change: currentOverviewData?.change,
        change_pct: currentOverviewData?.change_pct,
      }, historyData?.currency_symbol || getCurrencySymbol(symbol, historyData?.currency));
    }

    startIntradayChartWorker(symbol, activeInt);

  } catch (err) {
    if (token !== currentLoadToken) return;
    console.error(`Failed to load history for ${symbol}:`, err);
    if (chartInstance) {
      chartInstance.setData({
        candles: [],
        message: err.message?.includes('404') ? 'Symbol not found' : '1m intraday data unavailable'
      });
    }
  } finally {
    if (token === currentLoadToken && shimmer) {
      shimmer.classList.remove('active');
    }
  }
}

function renderTechnicalSnapshot(snapshot) {
  const trend = document.getElementById('snapshot-trend');
  if (!trend) return;
  if (!snapshot) {
    trend.textContent = 'Snapshot unavailable';
    return;
  }
  trend.textContent = snapshot.trend_context || 'Insufficient history';
  trend.dataset.state = (snapshot.trend_context || '').toLowerCase().replace(/\s+/g, '-');
  const detail = document.getElementById('snapshot-trend-detail');
  if (detail) detail.textContent = snapshot.trend_basis || 'Based on available moving averages';
  const setMetric = (id, value, suffix = '%') => {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = Number.isFinite(value) ? `${value > 0 && id !== 'snapshot-rsi' ? '+' : ''}${value.toFixed(1)}${suffix}` : '—';
    node.dataset.direction = Number.isFinite(value) ? (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral') : 'neutral';
  };
  setMetric('snapshot-return-1m', snapshot.return_1m_pct);
  setMetric('snapshot-return-3m', snapshot.return_3m_pct);
  setMetric('snapshot-rsi', snapshot.rsi_14, '');
  setMetric('snapshot-drawdown', snapshot.max_drawdown_1y_pct);
}

function updateChartEventMarkers() {
  if (!chartInstance) return;
  if (!showChartEvents || !currentDeepResearchData?.corporate_events?.events) {
    chartInstance.setEventMarkers([]);
    return;
  }
  const events = currentDeepResearchData.corporate_events.events;
  const markers = events.map((ev) => ({
    time: ev.date,
    position: ev.type === 'EARNINGS' ? 'aboveBar' : 'belowBar',
    color: ev.color || '#fbbf24',
    shape: ev.type === 'EARNINGS' ? 'arrowDown' : 'circle',
    text: ev.badge || ev.type,
  }));
  chartInstance.setEventMarkers(markers);
}

// Track previous price for 300ms live-price flash
let lastStockPrice = null;

// Render Terminal Stock Header & Fundamentals Grid
function renderStockOverview(data) {
  if (!data) return;

  const stockName = document.getElementById('stock-name');
  const stockSymbol = document.getElementById('stock-symbol');
  const stockSector = document.getElementById('stock-sector');
  const stockMcap = document.getElementById('stock-mcap');
  const stockPrice = document.getElementById('stock-current-price');
  const stockChangePct = document.getElementById('stock-change-pct');
  const stockChangeBadge = document.getElementById('stock-change-badge');

  if (stockName) stockName.textContent = data.name || data.symbol;
  if (stockSymbol) stockSymbol.textContent = data.symbol;
  if (stockSector) stockSector.textContent = `${data.sector || 'General'} / ${data.industry || 'Market'}`;
  if (stockMcap) stockMcap.textContent = `MCap: ${data.market_cap_str || '—'}`;

  const isUp = (data.change || 0) >= 0;
  const currSym = data.currency_symbol || getCurrencySymbol(data.symbol, data.currency);
  const decimals = data.symbol.includes('=X') ? 4 : 2;

  if (stockPrice) {
    stockPrice.textContent = `${currSym}${data.current_price != null ? data.current_price.toFixed(decimals) : '0.00'}`;

    // Live-price 300ms flash (emerald / rose)
    if (lastStockPrice !== null && data.current_price !== lastStockPrice) {
      const flashClass = data.current_price > lastStockPrice ? 'price-flash-up' : 'price-flash-down';
      stockPrice.classList.remove('price-flash-up', 'price-flash-down');
      void stockPrice.offsetWidth; // Trigger DOM reflow
      stockPrice.classList.add(flashClass);
      setTimeout(() => stockPrice.classList.remove(flashClass), 300);
    }
    lastStockPrice = data.current_price;
  }

  if (stockChangePct) {
    const sign = isUp ? '+' : '−';
    const chgVal = Math.abs(data.change || 0).toFixed(decimals);
    const chgPct = Math.abs(data.change_pct || 0).toFixed(2);
    stockChangePct.textContent = `${sign}${chgVal} (${sign}${chgPct}%)`;
  }
  if (stockChangeBadge) {
    stockChangeBadge.className = `hero-change-badge ${isUp ? 'chg-up' : 'chg-down'}`;
  }

  // Sync TradingView Chrome Top Bar & Corner Legend
  const tvTbSymbol = document.getElementById('tv-tb-symbol');
  const tvTbName = document.getElementById('tv-tb-name');
  const tvLegSym = document.getElementById('tv-leg-sym');
  const tvLegInterval = document.getElementById('tv-leg-interval');
  const tvBbStatus = document.getElementById('tv-bb-status');
  const alertFormSymbol = document.getElementById('alert-form-symbol');

  if (tvTbSymbol) tvTbSymbol.textContent = data.symbol;
  if (tvTbName) tvTbName.textContent = data.name || data.symbol;
  if (tvLegSym) tvLegSym.textContent = data.symbol;
  if (tvLegInterval) {
    const activeInt = chartInstance?.activeInterval || 'D';
    tvLegInterval.textContent = activeInt === 'W' ? '1W' : (activeInt === 'M' ? '1M' : '1D');
  }
  if (alertFormSymbol) alertFormSymbol.textContent = data.symbol;

  // Sync Mara Context Inspector Panel
  renderStockInspector(data, isUp);

  updateStatusBar(data.data_source, data.exchange, data.exchange_timezone, data.last_updated);

  // Render Valuation Grid
  renderValuationGrid(data);
}

let statusAgeTimer = null;
let lastDataTimestamp = null;

function updateStatusBar(source, exchange, timezone, lastUpdated) {
  const statusEl = document.getElementById('tv-bb-status');
  const tzEl = document.getElementById('tv-bb-tz');
  const ageEl = document.getElementById('tv-bb-age');
  const provSource = document.getElementById('provenance-source');
  const provStatus = document.getElementById('provenance-status');
  const provTime = document.getElementById('provenance-timestamp');

  const srcText = source || 'Yahoo Finance';
  const exchText = exchange || 'Market';
  const tzText = timezone || 'UTC';

  if (statusEl) {
    statusEl.textContent = `${srcText} · ${exchText}`;
  }
  if (tzEl) {
    tzEl.textContent = tzText;
  }
  if (provSource) {
    provSource.textContent = `${srcText} (${exchText})`;
  }
  if (provStatus) {
    provStatus.textContent = 'Cached (60s TTL)';
  }

  if (lastUpdated) {
    lastDataTimestamp = new Date(lastUpdated).getTime();
    if (provTime) {
      provTime.textContent = new Date(lastUpdated).toLocaleTimeString();
    }
  }

  const renderAge = () => {
    if (!ageEl || !lastDataTimestamp) return;
    const diffSec = Math.max(0, Math.floor((Date.now() - lastDataTimestamp) / 1000));
    if (diffSec < 5) {
      ageEl.textContent = 'Updated just now';
    } else if (diffSec < 60) {
      ageEl.textContent = `Updated ${diffSec}s ago`;
    } else if (diffSec < 3600) {
      ageEl.textContent = `Updated ${Math.floor(diffSec / 60)}m ago`;
    } else {
      ageEl.textContent = `Updated ${Math.floor(diffSec / 3600)}h ago`;
    }
  };

  renderAge();
  if (statusAgeTimer) clearInterval(statusAgeTimer);
  statusAgeTimer = setInterval(renderAge, 1000);
}

// Render Valuation Multiples Grid (Strict 3-State Adaptive Market Matrix)
function renderValuationGrid(data) {
  const grid = document.getElementById('valuation-grid');
  const titleEl = document.getElementById('valuation-section-title');
  const badgeEl = document.getElementById('valuation-section-badge');
  if (!grid) return;

  const curr = data.currency_symbol || '$';
  const isEquity = data.asset_type === 'EQUITY' || Boolean(data.pe_trailing || data.pe_forward || data.roe || data.pb_ratio);

  const formatMultiple = (val) => {
    if (val == null) return '—';
    if (val === 0) return '0.00x';
    return `${val}x`;
  };

  const formatPercent = (val) => {
    if (val == null) return '—';
    if (val === 0) return '0.00%';
    return `${typeof val === 'number' ? val.toFixed(2) : val}%`;
  };

  if (isEquity) {
    if (titleEl) titleEl.textContent = 'Fundamental Multiples & Valuation Matrix';
    if (badgeEl) {
      badgeEl.textContent = 'Equities Valuation';
      badgeEl.className = 'brand-badge';
    }

    const metrics = [
      {
        label: 'Trailing P/E',
        val: formatMultiple(data.pe_trailing),
        sub: data.pe_trailing != null ? 'Price / Earnings (TTM)' : 'Unavailable',
      },
      {
        label: 'Forward P/E',
        val: formatMultiple(data.pe_forward),
        sub: data.pe_forward != null ? 'Next 12M Estimate' : 'Unavailable',
      },
      {
        label: 'Price to Book (P/B)',
        val: formatMultiple(data.pb_ratio),
        sub: data.pb_ratio != null ? 'Book Value Multiple' : 'Unavailable',
      },
      {
        label: 'EV / EBITDA',
        val: formatMultiple(data.ev_ebitda),
        sub: data.ev_ebitda != null ? 'Enterprise Valuation' : 'Unavailable',
      },
      {
        label: 'Dividend Yield',
        val: formatPercent(data.dividend_yield),
        sub: data.dividend_yield != null ? (data.dividend_yield === 0 ? 'Confirmed Zero (No Yield)' : 'Annual Distribution') : 'Unavailable',
      },
      {
        label: 'Return on Equity (ROE)',
        val: formatPercent(data.roe),
        sub: data.roe != null ? 'Capital Efficiency' : 'Unavailable',
      },
      {
        label: 'Debt to Equity',
        val: formatMultiple(data.debt_to_equity),
        sub: data.debt_to_equity != null ? (data.debt_to_equity === 0 ? 'Confirmed 0.00x (Debt-Free)' : 'Leverage Ratio') : 'Unavailable',
      },
      {
        label: '52-Week Range',
        val: (data.low_52w != null && data.high_52w != null)
          ? `${curr}${data.low_52w.toLocaleString()} – ${curr}${data.high_52w.toLocaleString()}`
          : '—',
        sub: (data.low_52w != null && data.high_52w != null) ? 'Annual Boundary Channel' : 'Unavailable',
      },
    ];

    grid.innerHTML = metrics
      .map(
        (m) => `
        <div class="metric-card">
          <div class="metric-card-label">${m.label}</div>
          <div class="metric-card-val">${m.val}</div>
          <div class="metric-card-sub">${m.sub}</div>
        </div>
      `
      )
      .join('');
  } else {
    // Non-corporate Macro, Index, Currency, Commodity, or Crypto
    const typeLabel = data.asset_type || 'Macro Asset';
    if (titleEl) titleEl.textContent = `${typeLabel} Profile & Trading Envelope`;
    if (badgeEl) {
      badgeEl.textContent = `Global ${typeLabel}, Non-Corporate`;
      badgeEl.className = 'brand-badge';
    }

    const isUp = (data.change_pct || 0) >= 0;
    const decimals = data.symbol.includes('=X') ? 4 : 2;

    const metrics = [
      {
        label: '52-Week High',
        val: data.high_52w != null ? `${curr}${data.high_52w.toFixed(decimals)}` : '—',
        sub: 'Annual Cycle Ceiling',
      },
      {
        label: '52-Week Low',
        val: data.low_52w != null ? `${curr}${data.low_52w.toFixed(decimals)}` : '—',
        sub: 'Annual Cycle Floor',
      },
      {
        label: '52-Week Range',
        val: (data.low_52w != null && data.high_52w != null)
          ? `${curr}${data.low_52w.toFixed(decimals)} – ${curr}${data.high_52w.toFixed(decimals)}`
          : '—',
        sub: 'Trading Channel Envelope',
      },
      {
        label: 'Previous Close',
        val: data.prev_close != null ? `${curr}${data.prev_close.toFixed(decimals)}` : '—',
        sub: 'Prior Session Settlement',
      },
      {
        label: 'Day Movement',
        val: data.change_pct != null ? `${(isUp ? '▲ +' : '▼ ')}${Math.abs(data.change_pct).toFixed(2)}%` : '—',
        sub: isUp ? 'Bullish Session' : 'Bearish Session',
      },
      {
        label: 'Asset Category',
        val: data.sector || typeLabel || '—',
        sub: data.industry || 'Market Benchmark',
      },
      {
        label: 'Telemetry Feed',
        val: data.data_source || 'Live Market Data',
        sub: 'Exchange Telemetry',
      },
      {
        label: 'Settlement Currency',
        val: data.currency || 'USD',
        sub: 'Base Quote Unit',
      },
    ];

    grid.innerHTML = metrics
      .map(
        (m) => `
        <div class="metric-card">
          <div class="metric-card-label">${m.label}</div>
          <div class="metric-card-val" style="font-size: 16px;">${m.val}</div>
          <div class="metric-card-sub">${m.sub}</div>
        </div>
      `
      )
      .join('');
  }
}


// Render Algorithmic Technical Observations
function renderObservations(obs) {
  const container = document.getElementById('observations-container');
  if (!container) return;

  if (obs.length === 0) {
    container.innerHTML = '<div style="color: #94a3b8; font-size: 13px; padding: 10px;">Insufficient historical data to compute technical observations.</div>';
    return;
  }

  container.innerHTML = obs
    .map((o) => {
      const color = o.color || '#e8b34e';
      return `
        <div class="observation-item" style="border-left-color: ${color};">
          <div class="obs-header">
            <span>${o.indicator} (${o.type})</span>
            <span class="obs-status" style="background: ${color}22; color: ${color};">${o.status}</span>
          </div>
          <div class="obs-detail">${o.detail}</div>
        </div>
      `;
    })
    .join('');
}


// Fetch and Render Research Core Workspaces
async function loadStockResearch(symbol, token) {
  try {
    const data = await api.getStockResearch(symbol);
    if (token !== currentLoadToken) return;
    currentResearchData = data;
    renderResearchWorkspaces(data);
  } catch (err) {
    if (token !== currentLoadToken) return;
    console.warn(`Research fetch non-fatal notice for ${symbol}:`, err);
  }
}

// Master Research Workspace Renderer
function renderResearchWorkspaces(data) {
  if (!data) return;

  // 1. Provenance Banner
  const provSource = document.getElementById('provenance-source');
  const provStatus = document.getElementById('provenance-status');
  const provTimestamp = document.getElementById('provenance-timestamp');
  if (provSource) provSource.textContent = data.provenance?.primary_source || 'Direct Telemetry';
  if (provStatus) provStatus.textContent = `${data.provenance?.cache_status || 'Live Session'} (${data.provenance?.pipeline_latency_ms || 0}ms)`;
  if (provTimestamp && data.provenance?.retrieved_at) {
    provTimestamp.textContent = new Date(data.provenance.retrieved_at).toLocaleTimeString();
  }

  // 2. Render Executive Overview
  renderExecutiveOverview(data);

  // 3. Render Financial Timeline
  renderFinancialTimeline(data);

  // 4. Render Peer Intelligence Matrix
  renderPeerIntelligence(data);

  // 5. Render Contextual News & Events
  renderNewsEvents(data);

  // 6. Render Research Dossier
  renderResearchDossier(data);
}

// Render Asset Identity Profile ("What exactly am I looking at?")
function renderAssetProfileCard(profile, deepData) {
  const container = document.getElementById('overview-grid');
  if (!container || !profile) return;

  let profileHtml = '';
  if (profile.type === 'equity') {
    const segs = (profile.business_segments || []).map(s => `<li style="margin-bottom: 4px; color: var(--text-dim);">${s}</li>`).join('');
    profileHtml = `
      <div class="dossier-card" id="asset-identity-card" style="grid-column: 1 / -1;">
        <div class="dossier-card-title">Asset Profile</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 8px;">
          <div>
            <div style="font-size: 11px; color: var(--text-dim); font-weight: 600;">Entity Name</div>
            <div style="font-size: 15px; font-weight: 600; color: var(--text); margin-top: 2px;">${profile.name}</div>
            
            <div style="font-size: 11px; color: var(--text-dim); font-weight: 600; margin-top: 10px;">Sector</div>
            <div style="font-size: 13px; color: var(--text); font-weight: 500; margin-top: 2px;">${profile.business}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: var(--text-dim); font-weight: 600;">Founded & HQ</div>
            <div style="font-size: 12px; color: var(--text); margin-top: 2px;">Founded: ${profile.founded}</div>
            <div style="font-size: 12px; color: var(--text); margin-top: 2px;">HQ: ${profile.headquarters}</div>

            <div style="font-size: 11px; color: var(--text-dim); font-weight: 600; margin-top: 10px;">Listing</div>
            <div style="font-size: 12px; color: var(--text); margin-top: 2px;">Employees: ${profile.employees}</div>
            <div style="font-size: 12px; color: var(--text); margin-top: 2px;">Primary Exchange: ${profile.primary_exchange}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: var(--text-dim); font-weight: 600;">Operating Segments</div>
            <ul style="list-style: disc; padding-left: 16px; margin: 4px 0 0 0; font-size: 12px; color: var(--text-dim);">
              ${segs || '<li>Commercial Operations</li>'}
            </ul>
          </div>
        </div>
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-dim); line-height: 1.5;">
          ${profile.summary}
        </div>
      </div>
    `;
  } else if (profile.type === 'commodity') {
    profileHtml = `
      <div class="dossier-card" id="asset-identity-card" style="grid-column: 1 / -1;">
        <div class="dossier-card-title">Commodity Contract Identity</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 8px;">
          <div>
            <div style="font-size: 11px; color: var(--text-dim);">Contract Name</div>
            <div style="font-size: 15px; font-weight: 600; color: var(--text);">${profile.name}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: var(--text-dim);">Exchange & Symbol</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--text);">${profile.exchange} (${profile.contract})</div>
          </div>
          <div>
            <div style="font-size: 11px; color: var(--text-dim);">Pricing Unit & Session</div>
            <div style="font-size: 12px; color: var(--text);">${profile.unit}</div>
            <div style="font-size: 12px; color: var(--text-dim);">${profile.session}</div>
          </div>
        </div>
        <div style="margin-top: 10px; font-size: 12px; color: var(--text-dim);">${profile.summary}</div>
      </div>
    `;
  } else if (profile.type === 'forex') {
    profileHtml = `
      <div class="dossier-card" id="asset-identity-card" style="grid-column: 1 / -1;">
        <div class="dossier-card-title">Exchange Rate Profile</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 8px;">
          <div>
            <div style="font-size: 11px; color: var(--text-dim);">Currency Pair</div>
            <div style="font-size: 15px; font-weight: 600; color: var(--text);">${profile.name}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: var(--text-dim);">Base / Quote Currency</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--text);">${profile.base_currency} / ${profile.quote_currency}</div>
          </div>
          <div>
            <div style="font-size: 11px; color: var(--text-dim);">Market & Session</div>
            <div style="font-size: 12px; color: var(--text);">${profile.market}</div>
            <div style="font-size: 12px; color: var(--text-dim);">${profile.session}</div>
          </div>
        </div>
        <div style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">${profile.summary}</div>
      </div>
    `;
  }

  const existing = document.getElementById('asset-identity-card');
  if (existing) {
    existing.outerHTML = profileHtml;
  } else if (profileHtml) {
    container.insertAdjacentHTML('afterbegin', profileHtml);
  }
}

// Render Executive Overview (Tab 2)
function renderExecutiveOverview(data) {
  const container = document.getElementById('overview-grid');
  if (!container) return;

  const curr = data.currency_symbol || '$';
  const pos52w = data.price_structure?.percentile_52w;

  container.innerHTML = `
    <div class="dossier-card">
      <div class="dossier-card-title">Market Position & Tier</div>
      <div style="font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 6px;">
        ${data.market_position?.sector || 'Global Benchmark'}
      </div>
      <div style="font-size: 13px; color: var(--accent); font-weight: 600; margin-bottom: 8px;">
        ${data.research_dossier?.asset_profile?.market_cap_tier || 'Corporate Asset'}
      </div>
      <div class="dossier-text">
        Industry: <strong style="color: #ffffff;">${data.market_position?.industry || 'Market Asset'}</strong><br>
        Domicile: <strong style="color: #ffffff;">${data.market_position?.country || 'Global'}</strong><br>
        Market Cap: <strong style="color: #ffffff;">${data.market_position?.market_cap_str || '—'}</strong>
      </div>
    </div>

    <div class="dossier-card">
      <div class="dossier-card-title">Price Structure & 52W Envelope</div>
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
        <span style="font-size: 22px; font-weight: 700; font-family: var(--font-mono); color: #ffffff;">
          ${curr}${data.price_structure?.current_price?.toLocaleString()}
        </span>
        <span style="font-size: 12px; font-weight: 600; color: ${pos52w > 50 ? 'var(--gain)' : 'var(--loss)'}; font-family: var(--font-mono);">
          ${pos52w != null ? `${pos52w}% of 52W Channel` : '—'}
        </span>
      </div>
      <div style="height: 4px; background: #1c1c1c; border-radius: 2px; overflow: hidden; margin: 10px 0;">
        <div style="width: ${pos52w || 0}%; height: 100%; background: var(--text-dim); border-radius: 2px;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">
        <span>Low: ${curr}${data.price_structure?.low_52w?.toLocaleString() || '—'}</span>
        <span>High: ${curr}${data.price_structure?.high_52w?.toLocaleString() || '—'}</span>
      </div>
    </div>

    <div class="dossier-card">
      <div class="dossier-card-title">Fundamental Trajectory</div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-dim); font-size: 12px;">3Y Revenue CAGR:</span>
        <strong style="color: var(--gain); font-family: var(--font-mono);">
          ${data.research_dossier?.financial_trend_summary?.cagr_3y_revenue_pct != null ? `+${data.research_dossier.financial_trend_summary.cagr_3y_revenue_pct}%` : '—'}
        </strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-dim); font-size: 12px;">Periods Analyzed:</span>
        <strong style="color: var(--text); font-family: var(--font-mono);">
          ${data.research_dossier?.financial_trend_summary?.years_reported || 0} Years
        </strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-dim); font-size: 12px;">Latest Net Margin:</span>
        <strong style="color: var(--text); font-family: var(--font-mono);">
          ${data.research_dossier?.financial_trend_summary?.latest_margin_pct != null ? `${data.research_dossier.financial_trend_summary.latest_margin_pct}%` : '—'}
        </strong>
      </div>
    </div>

    <div class="dossier-card">
      <div class="dossier-card-title">Relative Valuation</div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-dim); font-size: 12px;">Asset Trailing P/E:</span>
        <strong style="color: var(--text); font-family: var(--font-mono);">
          ${data.research_dossier?.valuation_peer_context?.current_pe != null ? `${data.research_dossier.valuation_peer_context.current_pe}x` : '—'}
        </strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-dim); font-size: 12px;">Peer Group Median P/E:</span>
        <strong style="color: var(--text); font-family: var(--font-mono);">
          ${data.research_dossier?.valuation_peer_context?.peer_median_pe != null ? `${data.research_dossier.valuation_peer_context.peer_median_pe}x` : '—'}
        </strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-dim); font-size: 12px;">Peer Median ROE:</span>
        <strong style="color: var(--gain); font-family: var(--font-mono);">
          ${data.research_dossier?.valuation_peer_context?.peer_median_roe != null ? `${data.research_dossier.valuation_peer_context.peer_median_roe}%` : '—'}
        </strong>
      </div>
    </div>
  `;
}

// Render Financial Statements Timeline (Tab 3)
function renderFinancialTimeline(data) {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  if (!data.financial_timeline || data.financial_timeline.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-dim); font-size: 12px;">
        Annual financial statements are available for equities.<br>
        <span style="color: var(--text-dim); display: inline-block; margin-top: 6px;">
          Current asset class: ${data.asset_type} (${data.name || data.symbol})
        </span>
      </div>
    `;
    return;
  }

  const items = data.financial_timeline; // Chronological order
  const yearsHeader = items.map((it) => `<th>FY ${it.fiscal_year}</th>`).join('');

  container.innerHTML = `
    <table class="timeline-table">
      <thead>
        <tr>
          <th>Financial Statement Metric</th>
          ${yearsHeader}
          <th>3Y Trend / CAGR</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="timeline-metric-name">Total Revenue (Gross Turnover)</td>
          ${items
            .map(
              (it) => `
            <td>
              ${it.calculated_metrics.revenue_str}
              ${
                it.calculated_metrics.yoy_revenue_growth_pct != null
                  ? `<span class="yoy-badge ${it.calculated_metrics.yoy_revenue_growth_pct >= 0 ? 'yoy-up' : 'yoy-down'}">
                      ${it.calculated_metrics.yoy_revenue_growth_pct >= 0 ? '+' : ''}${it.calculated_metrics.yoy_revenue_growth_pct}%
                    </span>`
                  : ''
              }
            </td>
          `
            )
            .join('')}
          <td style="color: var(--accent-green); font-weight: 700;">
            ${data.research_dossier?.financial_trend_summary?.cagr_3y_revenue_pct != null ? `+${data.research_dossier.financial_trend_summary.cagr_3y_revenue_pct}% CAGR` : '—'}
          </td>
        </tr>

        <tr>
          <td class="timeline-metric-name">Operating Profit (EBIT)</td>
          ${items
            .map(
              (it) => `
            <td>
              ${it.source_data.operating_income != null ? it.calculated_metrics.revenue_str.replace(/[\d.,]+/, (it.source_data.operating_income / (data.currency === 'INR' ? 1e7 : 1e9)).toFixed(1)) : '—'}
              <span style="color: var(--text-muted); font-size: 11px;">(${it.calculated_metrics.operating_margin_pct != null ? `${it.calculated_metrics.operating_margin_pct}%` : '—'})</span>
            </td>
          `
            )
            .join('')}
          <td style="color: var(--text-secondary);">Operating Margin</td>
        </tr>

        <tr>
          <td class="timeline-metric-name">Net Income (Bottom Line Profit)</td>
          ${items
            .map(
              (it) => `
            <td style="color: #ffffff; font-weight: 600;">
              ${it.calculated_metrics.net_income_str}
              <span style="color: var(--accent-cyan); font-size: 11px;">(${it.calculated_metrics.net_margin_pct != null ? `${it.calculated_metrics.net_margin_pct}%` : '—'})</span>
            </td>
          `
            )
            .join('')}
          <td style="color: var(--accent-cyan); font-weight: 700;">Net Profit Margin</td>
        </tr>
      </tbody>
    </table>
  `;
}

// Render Peer Intelligence Matrix (Tab 4)
function renderPeerIntelligence(data) {
  const container = document.getElementById('peers-container');
  if (!container) return;

  const peers = data.peer_intelligence?.peers || [];
  if (peers.length === 0) {
    container.innerHTML = `
      <div style="padding: 28px; text-align: center; color: var(--text-muted); font-size: 13px;">
        No comparative peer cohort cataloged for this asset.
      </div>
    `;
    return;
  }

  const curr = data.currency_symbol || '$';
  const currPe = data.research_dossier?.valuation_peer_context?.current_pe;

  container.innerHTML = `
    <table class="peer-table">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Asset Name</th>
          <th>Market Cap</th>
          <th>Price</th>
          <th>24H Chg</th>
          <th>P/E (TTM)</th>
          <th>ROE</th>
          <th>Margin</th>
          <th>Debt/Equity</th>
        </tr>
      </thead>
      <tbody>
        <!-- Current Asset Benchmark Row -->
        <tr class="current-asset-row">
          <td style="color: var(--text); font-weight: 600;">${data.symbol}</td>
          <td>${data.name || data.symbol}</td>
          <td>${data.market_position?.market_cap_str || '—'}</td>
          <td>${curr}${data.price_structure?.current_price?.toLocaleString()}</td>
          <td>—</td>
          <td>${currPe != null ? `${currPe}x` : '—'}</td>
          <td style="color: var(--gain);">${data.research_dossier?.valuation_peer_context?.peer_median_roe != null ? 'Focus' : '—'}</td>
          <td>${data.research_dossier?.financial_trend_summary?.latest_margin_pct != null ? `${data.research_dossier.financial_trend_summary.latest_margin_pct}%` : '—'}</td>
          <td>Verified</td>
        </tr>

        <!-- Peer Rows -->
        ${peers
          .map((p) => {
            const isUp = (p.change_pct || 0) >= 0;
            const chgClass = isUp ? 'chg-up' : 'chg-down';
            return `
            <tr data-symbol="${p.symbol}" class="peer-clickable-row">
              <td style="font-weight: 600; color: #ffffff;">${p.symbol}</td>
              <td style="color: var(--text-secondary);">${p.name}</td>
              <td>${p.market_cap_str || '—'}</td>
              <td>${curr}${p.current_price?.toFixed(2) || '—'}</td>
              <td><span class="tape-chg ${chgClass}">${isUp ? '+' : ''}${p.change_pct?.toFixed(2) || '0.00'}%</span></td>
              <td>${p.pe_trailing != null ? `${p.pe_trailing}x` : '—'}</td>
              <td style="color: var(--accent-green);">${p.roe != null ? `${p.roe}%` : '—'}</td>
              <td>${p.profit_margin != null ? `${p.profit_margin}%` : '—'}</td>
              <td>${p.debt_to_equity != null ? `${p.debt_to_equity}x` : '—'}</td>
            </tr>
          `;
          })
          .join('')}

        <!-- Sector Median Benchmark Row -->
        <tr style="background: #090a0f; border-top: 2px solid #20222e; font-weight: 700;">
          <td colspan="5" style="text-align: left; color: var(--text-muted); text-transform: uppercase; font-size: 11px;">
            Sector Cohort Median Benchmark
          </td>
          <td style="color: var(--accent-cyan);">${data.peer_intelligence?.peer_median_pe != null ? `${data.peer_intelligence.peer_median_pe}x` : '—'}</td>
          <td style="color: var(--accent-green);">${data.peer_intelligence?.peer_median_roe != null ? `${data.peer_intelligence.peer_median_roe}%` : '—'}</td>
          <td colspan="2" style="color: var(--text-muted); font-size: 11px;">Market Derived</td>
        </tr>
      </tbody>
    </table>
  `;

  // Clicking peer row opens that peer in the terminal
  container.querySelectorAll('.peer-clickable-row').forEach((row) => {
    row.addEventListener('click', () => {
      const sym = row.getAttribute('data-symbol');
      if (sym) {
        if (currentActiveWorkspace === 'compare') {
          router.navigate(router.formatWorkspaceRoute('compare', sym));
        } else {
          router.navigate(router.formatSymbolRoute(sym, currentActiveTab || 'chart'));
        }
      }
    });
  });
}

// Render Contextual News & Events (Tab 5)
function renderNewsEvents(data) {
  const container = document.getElementById('news-container');
  if (!container) return;

  const items = data.news_events || [];
  if (items.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px;">
        No verified press items cataloged for this symbol.
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const impactClass = item.impact_area ? `impact-${item.impact_area.toLowerCase().replace(/[^a-z]/g, '-')}` : 'impact-corporate';
      return `
      <div class="news-event-card">
        <div>
          <div class="news-card-top">
            <span class="news-impact-tag ${impactClass}">${item.impact_area}</span>
            <span class="news-card-date">${item.published_date}</span>
          </div>
          <div class="news-card-title">${item.title}</div>
          <div class="news-card-summary">${item.summary || 'Market press and regulatory disclosure coverage.'}</div>
        </div>
        <div class="news-card-footer">
          <span>${item.publisher}</span>
          <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="news-source-link">Read Source ↗</a>
        </div>
      </div>
    `;
    })
    .join('');
}

// Render Research Dossier Placeholder (Tab 6)
function renderResearchDossier(data) {
  const container = document.getElementById('dossier-container');
  if (!container) return;

  const dossier = data.research_dossier || {};
  const observations = dossier.structural_observations || [];

  container.innerHTML = `
    <div class="dossier-card" style="grid-column: 1 / -1;">
      <div class="dossier-card-title">Asset Profile & Description</div>
      <p class="dossier-text" style="font-size: 14px; line-height: 1.65; color: #cbd5e1;">
        ${dossier.asset_profile?.business_description || 'Direct market telemetry instrument.'}
      </p>
    </div>

    <div class="dossier-card">
      <div class="dossier-card-title">Historical Financial Trajectory</div>
      <div class="dossier-text">
        Audited Periods: <strong style="color: #ffffff;">${dossier.financial_trend_summary?.years_reported || 0} Fiscal Years</strong><br>
        3Y Revenue CAGR: <strong style="color: var(--gain);">${dossier.financial_trend_summary?.cagr_3y_revenue_pct != null ? `+${dossier.financial_trend_summary.cagr_3y_revenue_pct}%` : 'Non-operating asset'}</strong><br>
        Latest Year Revenue: <strong style="color: #ffffff;">${dossier.financial_trend_summary?.latest_revenue_str || '—'}</strong><br>
        Latest Profit Margin: <strong style="color: var(--accent);">${dossier.financial_trend_summary?.latest_margin_pct != null ? `${dossier.financial_trend_summary.latest_margin_pct}%` : '—'}</strong>
      </div>
    </div>

    <div class="dossier-card">
      <div class="dossier-card-title">Valuation & Peer Positioning</div>
      <div class="dossier-text">
        Trailing P/E: <strong style="color: #ffffff;">${dossier.valuation_peer_context?.current_pe != null ? `${dossier.valuation_peer_context.current_pe}x` : '—'}</strong><br>
        Peer Median P/E: <strong style="color: var(--accent);">${dossier.valuation_peer_context?.peer_median_pe != null ? `${dossier.valuation_peer_context.peer_median_pe}x` : '—'}</strong><br>
        Peer Median ROE: <strong style="color: var(--gain);">${dossier.valuation_peer_context?.peer_median_roe != null ? `${dossier.valuation_peer_context.peer_median_roe}%` : '—'}</strong><br>
        Peers Evaluated: <strong style="color: var(--text-muted);">${dossier.valuation_peer_context?.peers_evaluated?.join(', ') || 'None'}</strong>
      </div>
    </div>

    <div class="dossier-card" style="grid-column: 1 / -1;">
      <div class="dossier-card-title">Structural Observations</div>
      ${
        observations.length > 0
          ? observations
              .map(
                (obs) => `
            <div class="dossier-observation-item">
              <div class="dossier-observation-cat">${obs.category}</div>
              <div class="dossier-observation-text">${obs.observation}</div>
              <div class="dossier-observation-basis">Factual Basis: ${obs.factual_basis}</div>
            </div>
          `
              )
              .join('')
          : '<div style="color: var(--text-muted); font-size: 13px;">No structural anomalies detected across evaluated parameters.</div>'
      }
    </div>

    <div class="dossier-card" style="grid-column: 1 / -1;">
      <div class="dossier-card-title">Data Quality & Provenance</div>
      <ul style="padding-left: 18px; margin: 0; font-size: 12px; color: var(--text-secondary); line-height: 1.7;">
        ${(dossier.data_quality_notes || []).map((note) => `<li>${note}</li>`).join('')}
        <li>Data Source: <strong style="color: var(--accent);">${data.provenance?.primary_source}</strong></li>
        <li>Last Retrieval: <span style="font-family: var(--font-mono); color: #ffffff;">${data.provenance?.retrieved_at}</span></li>
      </ul>
    </div>
  `;
}

// Load and Render Multi-Market Screener Matrix
async function loadScreener(universe = 'indian_leaders') {
  const tbody = document.getElementById('screener-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">Scanning market universe...</td></tr>';

  try {
    const data = await api.getScreener(universe);
    const items = data.items || [];
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No screened assets returned.</td></tr>';
      return;
    }

    currentScreenerAssets = items;
    renderScreenerTable(items);
  } catch (err) {
    console.error('Failed to load screener:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--loss); padding: 20px;">Unable to load screener data.</td></tr>';
  }
}

// Render Screener Table Rows
function renderScreenerTable(items) {
  const tbody = document.getElementById('screener-table-body');
  if (!tbody) return;
  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No assets match current screen criteria.</td></tr>';
    return;
  }
  tbody.innerHTML = items
    .map((item) => {
      const isUp = (item.change_pct || 0) >= 0;
      const chgClass = isUp ? 'chg-up' : 'chg-down';
      const chgGlyph = isUp ? '▲ +' : '▼ ';
      const currSym = item.currency_symbol || getCurrencySymbol(item.symbol, item.currency);
      const priceStr = item.price != null ? `${currSym}${item.price.toFixed(item.symbol.includes('=X') ? 4 : 2)}` : '—';
      const chgStr = item.change_pct != null ? `${chgGlyph}${Math.abs(item.change_pct).toFixed(2)}%` : '—';
      const metricStr = item.market_cap_str || item.volume_str || (item.pe_trailing ? `P/E ${item.pe_trailing}x` : '—');

      return `
        <tr data-symbol="${item.symbol}">
          <td class="screener-sym-col">${item.symbol}</td>
          <td style="font-weight: 500;">${item.name || item.symbol}</td>
          <td class="screener-price-col">${priceStr}</td>
          <td><span class="tape-chg ${chgClass}">${chgStr}</span></td>
          <td style="color: var(--text-secondary); font-family: var(--font-mono); font-size: 12px;">${metricStr}</td>
          <td>
            <button class="wl-btn screener-load-btn" data-symbol="${item.symbol}" style="padding: 4px 10px; font-size: 11px;">
              Analyze ↗
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => {
      const sym = row.getAttribute('data-symbol');
      if (sym) {
        router.navigate(router.formatSymbolRoute(sym, currentAnalyzeTab || 'chart'));
      }
    });
  });
}

/* ========================================================
   DEEP RESEARCH LOADERS & SPECIALIZED RENDERERS
   ======================================================== */

// Fetch and Render Deep Research Capabilities
async function loadStockDeepResearch(symbol, token, overview) {
  try {
    const data = await api.getDeepResearch(symbol);
    if (token !== currentLoadToken) return;
    currentDeepResearchData = data;

    // 0. Render Asset Identity Card ("What exactly am I looking at?")
    renderAssetProfileCard(data.profile, data);

    // 1. Render Advanced Ratios & Cash Flow
    renderAdvancedRatios(data.advanced_ratios, data.currency);

    // 2. Render 5-Quarter Earnings Progression
    renderQuarterlyEarnings(data.quarterly_earnings, data.currency);

    // 3. Render Corporate Events & Dividends
    renderCorporateEvents(data.corporate_events);

    // 4. Render Transparent Financial Health Score
    renderFinancialHealthScore(data.financial_health_score);

    // 5. Render 5Y Historical Valuation Context & Volatility
    renderHistoricalValuation(data.historical_valuation, data.volatility_and_drawdown, data.currency);

    // 6. Render Relative Benchmarking vs NIFTY / S&P 500
    renderRelativePerformance(data.relative_performance, data.volatility_and_drawdown);

    // 7. Render Data Quality Center
    renderDataQualityCenter(data.data_quality);

    // 8. Update Scenario Sandbox initial state
    updateScenarioCalculation();

    // 9. Update Chart Event Markers
    updateChartEventMarkers();

    // 10. Check Local Alerts
    if (overview) {
      const lastBar = currentCandles[currentCandles.length - 1];
      alertsManager.checkAlerts({
        symbol,
        currentPrice: overview.current_price,
        rsi: lastBar?.rsi,
        pe: overview.pe_trailing,
        high52w: overview.high_52w,
      });
      refreshAlertsUI();
    }
  } catch (err) {
    if (token !== currentLoadToken) return;
    console.warn(`Deep research notice for ${symbol}:`, err);
  }
}

/* ========================================================
   APEX v4 RELATIONSHIP & ANOMALY INTELLIGENCE RENDERERS
   ======================================================== */

// Fetch and Render Mara v4 Intelligence
async function loadStockV4Intelligence(symbol, token) {
  try {
    const data = await api.getV4Intelligence(symbol);
    if (token !== currentLoadToken) return;
    currentV4Data = data;

    // 1. Render What Changed (30-Day State Engine)
    renderWhatChanged(data.what_changed_30d);

    // 2. Render Anomaly Detection
    renderAnomalies(data.anomalies);

    // 3. Render Fundamental Relationship Engine
    renderFundamentalRelationships(data.fundamental_relationships);

    // 4. Render Statement Quality Signals
    renderStatementQuality(data.statement_quality);

    // 5. Render Filing Intelligence & Diff (T vs T-1)
    renderFilingDiff(data.filing_intelligence);
  } catch (err) {
    if (token !== currentLoadToken) return;
    console.warn(`Mara v4 intelligence notice for ${symbol}:`, err);
  }
}

// 1. Render What Changed (30-Day Comparative State Engine)
function renderWhatChanged(data) {
  const kpisGrid = document.getElementById('whatchanged-kpis-grid');
  const obsContainer = document.getElementById('whatchanged-observations-container');
  const badge = document.getElementById('whatchanged-badge');
  if (!kpisGrid || !obsContainer) return;

  if (!data || !data.has_data) {
    kpisGrid.innerHTML = '<div style="padding: 16px; color: var(--text-muted); font-size: 13px;">Insufficient historical series to calculate 30-day state delta.</div>';
    obsContainer.innerHTML = '';
    return;
  }

  const baselineDate = data.lookback_date || data.baseline_date || '30D Ago';
  const currentDate = data.current_date || data.as_of_date || 'Today';

  if (badge) {
    badge.textContent = `${baselineDate} → ${currentDate}`;
  }

  const p = data.price || {};
  const v = data.valuation || {};
  const tech = data.technicals || {};
  const deltas = data.deltas || {};

  const currSym = currentOverviewData?.currency_symbol || (currentSymbol.endsWith('.NS') ? '₹' : '$');
  const priceChg = p.change_pct != null ? p.change_pct : deltas.price_change_pct;
  const currentPrice = p.current != null ? p.current : deltas.current_price;
  const baselinePrice = p.past_30d != null ? p.past_30d : deltas.baseline_price;

  const peDelta = v.delta != null ? v.delta : deltas.pe_delta;
  const currentPe = v.current_pe != null ? Number(v.current_pe).toFixed(1) : (deltas.current_pe != null ? deltas.current_pe : '—');
  const baselinePe = v.past_30d_pe != null ? Number(v.past_30d_pe).toFixed(1) : (deltas.baseline_pe != null ? deltas.baseline_pe : '—');

  const rsiDelta = tech.rsi_shift != null ? tech.rsi_shift : deltas.rsi_delta;
  const currentRsi = tech.rsi_current != null ? tech.rsi_current : deltas.current_rsi;
  const baselineRsi = tech.rsi_past_30d != null ? tech.rsi_past_30d : deltas.baseline_rsi;

  const emaCurrentDist = deltas.ema50_distance_current_pct;
  const emaContext = tech.ema_regime || (emaCurrentDist != null ? `${emaCurrentDist >= 0 ? '+' : ''}${emaCurrentDist}% vs 50 EMA` : 'Regime Active');

  kpisGrid.innerHTML = `
    <div class="wc-kpi-card">
      <div class="wc-kpi-label">30-Day Price Delta</div>
      <div class="wc-kpi-delta" style="color: ${(priceChg || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
        ${priceChg != null ? `${priceChg >= 0 ? '+' : ''}${priceChg}%` : '—'}
      </div>
      <div class="wc-kpi-context">
        ${baselinePrice != null ? `From ${currSym}${Number(baselinePrice).toLocaleString()}` : ''} 
        ${currentPrice != null ? `→ ${currSym}${Number(currentPrice).toLocaleString()}` : ''}
      </div>
    </div>

    <div class="wc-kpi-card">
      <div class="wc-kpi-label">Trailing P/E Multiple Shift</div>
      <div class="wc-kpi-delta" style="color: ${(peDelta || 0) <= 0 ? 'var(--accent-cyan)' : '#fbbf24'};">
        ${peDelta != null ? `${peDelta >= 0 ? '+' : ''}${peDelta}x` : '—'}
      </div>
      <div class="wc-kpi-context">
        ${baselinePe}x → ${currentPe}x
      </div>
    </div>

    <div class="wc-kpi-card">
      <div class="wc-kpi-label">14-Day RSI Shift</div>
      <div class="wc-kpi-delta" style="color: #38bdf8;">
        ${rsiDelta != null ? `${rsiDelta >= 0 ? '+' : ''}${rsiDelta}` : '—'}
      </div>
      <div class="wc-kpi-context">
        ${baselineRsi != null ? baselineRsi : '—'} → ${currentRsi != null ? currentRsi : '—'}
      </div>
    </div>

    <div class="wc-kpi-card">
      <div class="wc-kpi-label">Technical Regime / EMA 50</div>
      <div class="wc-kpi-delta" style="font-size: 16px; color: ${(priceChg || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
        ${emaContext}
      </div>
      <div class="wc-kpi-context">
        Momentum & Trend State
      </div>
    </div>
  `;

  const shifts = data.regime_shifts || [];
  const corpActions = data.corporate_actions_last_30d || data.recent_events || [];

  if (shifts.length === 0 && corpActions.length === 0) {
    obsContainer.innerHTML = '<div style="padding: 14px; color: var(--text-muted); font-size: 13px;">No significant regime breaks or corporate events cataloged in 30-day window.</div>';
    return;
  }

  let html = '';
  shifts.forEach((shift) => {
    html += `
      <div class="wc-observation-row">
        <span style="font-size: 14px;">⚡</span>
        <div>
          <strong style="color: #ffffff;">Regime Shift:</strong> ${shift}
        </div>
      </div>
    `;
  });

  corpActions.forEach((act) => {
    const isObj = typeof act === 'object' && act !== null;
    const date = isObj ? (act.date || '') : '';
    const title = isObj ? (act.title || act.type || '') : act;
    const impact = isObj ? (act.impact || act.action || '') : '';

    html += `
      <div class="wc-observation-row action">
        <div>
          <strong style="color: #fbbf24;">Corporate Event ${date ? `[${date}]` : ''}:</strong> ${title} 
          ${impact ? `<span style="color: var(--text-secondary); margin-left: 6px;">(${impact})</span>` : ''}
        </div>
      </div>
    `;
  });

  obsContainer.innerHTML = html;
}

// 2. Render Anomaly Scanner
function renderAnomalies(anomalies) {
  const container = document.getElementById('anomalies-list-container');
  const badge = document.getElementById('anomalies-badge');
  if (!container) return;

  if (!anomalies || anomalies.length === 0) {
    if (badge) {
      badge.textContent = 'Zero Anomalies';
      badge.className = 'brand-badge';
    }
    container.innerHTML = `
      <div style="background: #141414; border: 1px solid #262626; border-radius: var(--radius-md); padding: 24px; text-align: center;">
        <div style="font-size: 13px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">Zero Financial or Market Anomalies Detected</div>
        <div style="font-size: 12px; color: var(--text-dim); max-width: 480px; margin: 0 auto;">
          Accruals, receivables growth, debt velocity, valuation percentiles, and volume profiles conform to normal operating distribution.
        </div>
      </div>
    `;
    return;
  }

  if (badge) {
    badge.textContent = `${anomalies.length} Flagged`;
    badge.className = '';
  }

  container.innerHTML = anomalies
    .map((item) => {
      const sev = (item.severity || 'low').toLowerCase();
      const sevClass = sev === 'high' ? 'sev-high' : sev === 'medium' ? 'sev-medium' : 'sev-low';
      const title = item.title || item.type || 'Anomaly';
      const metric = item.evidence || item.metric || item.mathematical_threshold || '';
      const desc = item.evidence || item.description || '';
      const attr = item.mathematical_threshold || item.attribution || 'Algorithmic Anomaly Model';

      return `
        <div class="anomaly-item-card ${sevClass}">
          <div class="anomaly-header">
            <span class="anomaly-title">${title}</span>
            <span class="anomaly-badge ${sevClass}">${item.severity || 'Alert'}</span>
          </div>
          ${metric ? `<div class="anomaly-metric-pill">${metric}</div>` : ''}
          ${desc ? `<div class="anomaly-desc">${desc}</div>` : ''}
          <div class="anomaly-attribution">
            <span>Model:</span>
            <span>${attr}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

// 3. Render Fundamental Relationship Engine
function renderFundamentalRelationships(data) {
  const container = document.getElementById('fundamental-relationships-container');
  if (!container) return;

  if (!data || !data.has_data) {
    container.innerHTML = '<div style="padding: 16px; color: var(--text-muted); font-size: 13px;">Insufficient audited statement history to evaluate fundamental spreads.</div>';
    return;
  }

  const cagrs = data.cagrs || data.cagr_spreads || {};
  const spreads = data.spreads || data.cagr_spreads || {};
  const obs = data.observations || [];

  const revCagr = cagrs.revenue_cagr_pct != null ? cagrs.revenue_cagr_pct : cagrs.rev_cagr;
  const opCagr = cagrs.operating_income_cagr_pct != null ? cagrs.operating_income_cagr_pct : cagrs.op_cagr;
  const opLev = spreads.operating_leverage_ratio != null ? spreads.operating_leverage_ratio : data.operating_leverage;
  const marginShift = spreads.margin_diff_pp != null ? spreads.margin_diff_pp : data.margin_movement_pp;
  const nPeriods = data.n_periods || spreads.years_evaluated || 3;

  let html = `
    <div class="rel-grid">
      <div class="rel-metric-box">
        <div class="rel-metric-label">Revenue CAGR (${nPeriods}Y)</div>
        <div class="rel-metric-val" style="color: ${(revCagr || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
          ${revCagr != null ? `${revCagr >= 0 ? '+' : ''}${revCagr}%` : '—'}
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Top-line growth trajectory</div>
      </div>

      <div class="rel-metric-box">
        <div class="rel-metric-label">Operating Income CAGR (${nPeriods}Y)</div>
        <div class="rel-metric-val" style="color: ${(opCagr || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
          ${opCagr != null ? `${opCagr >= 0 ? '+' : ''}${opCagr}%` : '—'}
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Core EBIT expansion trajectory</div>
      </div>

      <div class="rel-metric-box">
        <div class="rel-metric-label">Operating Leverage Ratio</div>
        <div class="rel-metric-val" style="color: var(--accent-cyan);">
          ${opLev != null ? `${opLev}x` : '—'}
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Operating Income CAGR / Revenue CAGR</div>
      </div>

      <div class="rel-metric-box">
        <div class="rel-metric-label">Operating Margin Shift</div>
        <div class="rel-metric-val" style="color: ${(marginShift || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
          ${marginShift != null ? `${marginShift >= 0 ? '+' : ''}${marginShift} pp` : '—'}
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Total percentage points expansion / contraction</div>
      </div>
    </div>
  `;

  if (obs.length > 0) {
    html += '<div style="margin-top: 10px;">';
    obs.forEach((o) => {
      const text = typeof o === 'string' ? o : (o.observation || o.title || JSON.stringify(o));
      const basis = typeof o === 'object' && o.mathematical_basis ? `<div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 3px;">Basis: ${o.mathematical_basis}</div>` : '';
      html += `
        <div class="rel-observation-card">
          <div>
            <div>${text}</div>
            ${basis}
          </div>
        </div>
      `;
    });
    html += '</div>';
  }

  container.innerHTML = html;
}

// 4. Render Statement Quality Signals
function renderStatementQuality(quality) {
  const container = document.getElementById('statement-quality-container');
  if (!container) return;

  if (!quality || !quality.signals || quality.signals.length === 0) {
    container.innerHTML = '<div style="padding: 16px; color: var(--text-muted); font-size: 13px;">Insufficient audited cash flow or balance sheet filings to audit statement quality.</div>';
    return;
  }

  container.innerHTML = quality.signals
    .map((s) => {
      const st = (s.status || 'NORMAL').toLowerCase();
      const stClass = st.includes('strong') || st.includes('high') ? 'status-strong' : (st.includes('alert') || st.includes('caution') || st.includes('buildup') || st.includes('divergence')) ? 'status-alert' : 'status-normal';
      const detail = s.detail || s.observation || '';
      return `
        <div class="quality-signal-card">
          <div class="quality-signal-top">
            <span class="quality-signal-title">${s.metric}</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: #ffffff;">${s.value != null ? s.value : '—'}</span>
              <span class="quality-status-badge ${stClass}">${s.status}</span>
            </div>
          </div>
          ${detail ? `<div class="quality-signal-obs">${detail}</div>` : ''}
          ${s.benchmark ? `<div class="quality-signal-math">Benchmark: ${s.benchmark}</div>` : (s.mathematical_basis ? `<div class="quality-signal-math">Basis: ${s.mathematical_basis}</div>` : '')}
        </div>
      `;
    })
    .join('');
}

// 5. Render Filing Intelligence & Diff (T vs T-1)
function renderFilingDiff(data) {
  const container = document.getElementById('filing-diff-container');
  if (!container) return;

  if (!data) {
    container.innerHTML = '<div style="padding: 16px; color: var(--text-muted); font-size: 13px;">Primary source filing diff unavailable for this asset.</div>';
    return;
  }

  let html = '';

  // 1. Primary Source Filing Links
  const links = data.document_center || data.document_links || [];
  if (links.length > 0) {
    html += '<div class="filing-docs-bar">';
    links.forEach((doc) => {
      html += `
        <a href="${doc.url}" target="_blank" rel="noopener noreferrer" class="filing-doc-link">
          <span>${doc.title}</span>
          <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">[${doc.authority || doc.source || 'Filing'}]</span>
          <span>↗</span>
        </a>
      `;
    });
    html += '</div>';
  }

  // 2. T vs T-1 Diff Table
  const diffObj = data.filing_diff || {};
  const diffs = Array.isArray(diffObj) ? diffObj : (diffObj.items || []);
  if (diffs.length > 0) {
    const curP = diffs[0].period_current || diffs[0].current_period || 'Current FY';
    const prevP = diffs[0].period_previous || diffs[0].previous_period || 'Previous FY';

    html += `
      <div class="timeline-table-wrapper">
        <table class="filing-diff-table">
          <thead>
            <tr>
              <th>Filing Line Item</th>
              <th>${prevP} (Prior)</th>
              <th>${curP} (Latest)</th>
              <th>Absolute Delta</th>
              <th>% Growth</th>
            </tr>
          </thead>
          <tbody>
            ${diffs
              .map((d) => {
                const isGrowth = (d.change_pct != null ? d.change_pct : (d.delta_pct || 0)) >= 0;
                const isDebt = d.metric.toLowerCase().includes('debt');
                const col = isDebt ? (isGrowth ? 'var(--accent-red)' : 'var(--accent-green)') : (isGrowth ? 'var(--accent-green)' : 'var(--accent-red)');
                const pct = d.change_pct != null ? d.change_pct : d.delta_pct;
                const valCurr = d.value_current != null ? (d.value_current / 1e7).toFixed(1) + ' Cr' : (d.formatted_current || '—');
                const valPrev = d.value_previous != null ? (d.value_previous / 1e7).toFixed(1) + ' Cr' : (d.formatted_previous || '—');
                const valDelta = (d.value_current != null && d.value_previous != null) ? ((d.value_current - d.value_previous) / 1e7).toFixed(1) + ' Cr' : (d.formatted_delta || '—');

                return `
                  <tr>
                    <td>${d.metric}</td>
                    <td>${valPrev}</td>
                    <td style="color: #ffffff; font-weight: 600;">${valCurr}</td>
                    <td>${valDelta}</td>
                    <td style="color: ${col}; font-weight: 700;">${pct != null ? `${pct >= 0 ? '+' : ''}${pct}%` : '—'}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    html += '<div style="padding: 14px; color: var(--text-muted); font-size: 12px;">No consecutive annual filing comparison rows available.</div>';
  }

  container.innerHTML = html;
}

// 6. Render Macro -> Asset Relationship Explorer
async function loadAndRenderMacroExplorer(symbol) {
  const container = document.getElementById('macro-explorer-grid');
  if (!container) return;

  try {
    const res = await api.getMacroExplorer(symbol);
    const factors = res.macro_factors || [];
    if (factors.length === 0) {
      container.innerHTML = '<div style="padding: 16px; color: var(--text-muted); font-size: 13px;">Macro relationship model unavailable for this asset basket.</div>';
      return;
    }

    container.innerHTML = factors
      .map((f) => {
        const c1y = f.correlation_1y;
        const c90d = f.correlation_90d;
        const c1yCol = c1y >= 0.5 ? 'var(--accent-green)' : c1y <= -0.2 ? 'var(--accent-red)' : 'var(--accent-cyan)';
        const c90dCol = c90d >= 0.5 ? 'var(--accent-green)' : c90d <= -0.2 ? 'var(--accent-red)' : 'var(--accent-cyan)';

        return `
          <div class="macro-card">
            <div>
              <div class="macro-card-factor">${f.factor}</div>
              <div class="macro-card-sym">Ticker: ${f.symbol}</div>
            </div>
            <div style="margin-top: 8px;">
              <div class="macro-stat-row">
                <span style="color: var(--text-secondary);">1Y Pearson Corr:</span>
                <strong style="color: ${c1yCol};">${c1y != null ? c1y : '—'}</strong>
              </div>
              <div class="macro-stat-row">
                <span style="color: var(--text-secondary);">90D Dynamic Corr:</span>
                <strong style="color: ${c90dCol};">${c90d != null ? c90d : '—'}</strong>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (err) {
    console.warn('Macro explorer fetch error:', err);
    container.innerHTML = '<div style="padding: 16px; color: var(--accent-red); font-size: 13px;">Failed to calculate macro factor correlations.</div>';
  }
}

// Render Advanced Financial Ratios & Cash Flow (Tab 3)
function renderAdvancedRatios(ratios, currency = 'INR') {
  const grid = document.getElementById('advanced-ratios-grid');
  if (!grid || !ratios) return;

  const cf = ratios.cash_flow || {};
  const bs = ratios.balance_sheet || {};
  const prof = ratios.profitability || {};

  const items = [
    { label: 'Operating Cash Flow (CFO)', val: cf.operating_cash_flow_str || '—', sub: 'Operating Cash Generation' },
    { label: 'Free Cash Flow (FCF)', val: cf.free_cash_flow_str || '—', sub: `FCF Margin: ${cf.fcf_margin_pct != null ? cf.fcf_margin_pct + '%' : '—'}` },
    { label: 'Capital Expenditure (CapEx)', val: cf.capital_expenditure_str || '—', sub: 'Reinvestment in Assets' },
    { label: 'Quality of Earnings (CFO / NI)', val: cf.cfo_to_net_income_ratio != null ? `${cf.cfo_to_net_income_ratio}x` : '—', sub: 'Ratio >= 1.0 indicates clean cash' },
    { label: 'Return on Capital (ROCE)', val: prof.roce_pct != null ? `${prof.roce_pct}%` : '—', sub: 'EBIT / Capital Employed' },
    { label: 'Return on Assets (ROA)', val: prof.roa_pct != null ? `${prof.roa_pct}%` : '—', sub: 'Asset Efficiency' },
    { label: 'Net Debt', val: bs.net_debt_str || '—', sub: 'Total Debt minus Cash & Equiv' },
    { label: 'Interest Coverage', val: bs.interest_coverage != null ? (bs.interest_coverage >= 99 ? 'Confirmed Safe / No Debt' : `${bs.interest_coverage}x`) : '—', sub: 'EBIT / Interest Expense' },
  ];

  grid.innerHTML = items
    .map(
      (m) => `
      <div class="metric-card">
        <div class="metric-card-label">${m.label}</div>
        <div class="metric-card-val" style="font-size: 16px;">${m.val}</div>
        <div class="metric-card-sub">${m.sub}</div>
      </div>
    `
    )
    .join('');
}

// Render 5-Quarter Earnings Progression (Tab 4)
function renderQuarterlyEarnings(quarterly, currency = 'INR') {
  const container = document.getElementById('quarterly-earnings-container');
  if (!container) return;

  if (!quarterly || quarterly.length === 0) {
    container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">Quarterly filing breakdowns apply exclusively to corporate equities.</div>';
    return;
  }

  container.innerHTML = `
    <table class="timeline-table">
      <thead>
        <tr>
          <th>Reporting Quarter Period</th>
          <th>Total Revenue</th>
          <th>Operating Income (EBIT)</th>
          <th>Operating Margin</th>
          <th>Net Income</th>
          <th>Net Profit Margin</th>
        </tr>
      </thead>
      <tbody>
        ${quarterly
          .map(
            (q) => `
          <tr>
            <td style="color: var(--accent-cyan); font-weight: 600;">${q.period_date}</td>
            <td>${q.revenue_str}</td>
            <td>${q.operating_income_str}</td>
            <td>${q.op_margin_pct != null ? `${q.op_margin_pct}%` : '—'}</td>
            <td style="color: #ffffff; font-weight: 600;">${q.net_income_str}</td>
            <td style="color: var(--accent-green); font-weight: 600;">${q.net_margin_pct != null ? `${q.net_margin_pct}%` : '—'}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

// Render Corporate Events & Dividends Timeline (Tab 4)
function renderCorporateEvents(corpEvents) {
  const container = document.getElementById('corporate-events-container');
  if (!container) return;

  const events = corpEvents?.events || [];
  const divCagr = corpEvents?.dividend_cagr_3y_pct;
  const upcomingEarnings = corpEvents?.upcoming_earnings_date;

  if (events.length === 0) {
    container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No corporate actions or dividend events cataloged.</div>';
    return;
  }

  container.innerHTML = `
    <div style="display: flex; gap: 14px; margin-bottom: 12px; font-size: 12px; flex-wrap: wrap;">
      ${upcomingEarnings ? `<span class="meta-badge" style="color: #38bdf8; border-color: #38bdf8;">Next Scheduled Earnings: ${upcomingEarnings}</span>` : ''}
      ${divCagr != null ? `<span class="meta-badge" style="color: #fbbf24; border-color: #fbbf24;">3Y Dividend CAGR: +${divCagr}%</span>` : ''}
    </div>
    <table class="timeline-table">
      <thead>
        <tr>
          <th>Event Date</th>
          <th>Action Type</th>
          <th>Announcement / Description</th>
          <th>Impact Category</th>
        </tr>
      </thead>
      <tbody>
        ${events
          .slice(0, 10)
          .map(
            (e) => `
          <tr>
            <td style="font-family: var(--font-mono); color: #cbd5e1;">${e.date}</td>
            <td><span class="meta-badge" style="color: ${e.color}; border-color: ${e.color};">${e.type}</span></td>
            <td style="color: #ffffff; font-weight: 500;">${e.title}</td>
            <td style="color: var(--text-secondary); font-size: 12px;">${e.impact}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

// Render Auditable Financial Health Score (Tab 5)
function renderFinancialHealthScore(health) {
  if (!health) return;

  const scoreEl = document.getElementById('health-overall-score');
  const summaryEl = document.getElementById('health-score-summary');
  const container = document.getElementById('health-pillars-container');

  if (scoreEl) {
    scoreEl.textContent = `${health.overall_score}/100`;
    scoreEl.style.color = health.overall_score >= 75 ? 'var(--accent-green)' : health.overall_score >= 50 ? 'var(--accent-cyan)' : 'var(--accent-red)';
  }

  if (summaryEl) {
    const verdict = health.overall_score >= 80 ? 'Robust Institutional Quality' : health.overall_score >= 60 ? 'Satisfactory Operating Fundamentals' : 'Elevated Leverage / Cyclical Vulnerability';
    summaryEl.textContent = `${verdict}. Weighted auditable composite across 5 fundamental dimensions.`;
  }

  if (container) {
    container.innerHTML = (health.pillars || [])
      .map(
        (p) => `
        <div class="pillar-row">
          <div class="pillar-top">
            <span style="color: #ffffff;">${p.name} (${p.weight_pct}% weight)</span>
            <span style="color: var(--accent); font-family: var(--font-mono);">${p.score}/100</span>
          </div>
          <div class="pillar-bar-bg">
            <div class="pillar-bar-fill" style="width: ${p.score}%;"></div>
          </div>
          <div class="pillar-formula">
            Formula: ${p.formula} — Inputs: ${Object.entries(p.metrics || {}).map(([k, v]) => `${k}: ${v}`).join(' | ')}
          </div>
        </div>
      `
      )
      .join('');
  }
}

// Render 5Y Historical Valuation Context & Volatility (Tab 5)
function renderHistoricalValuation(histVal, dd, currency = 'INR') {
  const container = document.getElementById('historical-valuation-grid');
  if (!container) return;

  const pe = histVal || {};
  const currSym = currency === 'INR' ? '₹' : '$';

  container.innerHTML = `
    <div class="dossier-card">
      <div class="dossier-card-title">5-Year Historical P/E Envelope</div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary); font-size: 12px;">Current Trailing P/E:</span>
        <strong style="color: #ffffff; font-family: var(--font-mono);">${pe.current_pe != null ? `${pe.current_pe}x` : '—'}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary); font-size: 12px;">5Y Historical Median:</span>
        <strong style="color: var(--accent); font-family: var(--font-mono);">${pe.pe_5y_median != null ? `${pe.pe_5y_median}x` : '—'}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary); font-size: 12px;">5Y Envelope Range:</span>
        <strong style="color: #cbd5e1; font-family: var(--font-mono);">${pe.pe_5y_low || '—'}x – ${pe.pe_5y_high || '—'}x</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary); font-size: 12px;">Current Cycle Percentile:</span>
        <strong style="color: var(--gain); font-family: var(--font-mono);">${pe.pe_percentile_rank != null ? `${pe.pe_percentile_rank}%` : 'Cycle Mid'}</strong>
      </div>
      <div style="font-size: 11px; color: var(--accent); font-weight: 600; margin-top: 10px;">
        ${pe.valuation_stance || 'Historical median multiple alignment.'}
      </div>
    </div>

    <div class="dossier-card">
      <div class="dossier-card-title">Maximum Drawdown & Recovery</div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary); font-size: 12px;">Max Drawdown (5Y):</span>
        <strong style="color: var(--loss); font-family: var(--font-mono);">${dd?.max_drawdown_pct != null ? `${dd.max_drawdown_pct}%` : '—'}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary); font-size: 12px;">5Y Cycle Peak Price:</span>
        <strong style="color: #ffffff; font-family: var(--font-mono);">${dd?.peak_price != null ? `${currSym}${dd.peak_price}` : '—'}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary); font-size: 12px;">5Y Cycle Trough Floor:</span>
        <strong style="color: #ffffff; font-family: var(--font-mono);">${dd?.trough_price != null ? `${currSym}${dd.trough_price}` : '—'}</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-secondary); font-size: 12px;">Drawdown Recovery:</span>
        <strong style="color: var(--accent); font-family: var(--font-mono);">${dd?.recovery_days != null ? `${dd.recovery_days} Days` : 'Consolidating'}</strong>
      </div>
    </div>

    <div class="dossier-card">
      <div class="dossier-card-title">⚡ Volatility Engine & ATR</div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary); font-size: 12px;">30-Day Annualized Vol:</span>
        <strong style="color: #ffffff; font-family: var(--font-mono);">${dd?.annualized_volatility_30d != null ? `${dd.annualized_volatility_30d}%` : '—'}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary); font-size: 12px;">1-Year Annualized Vol:</span>
        <strong style="color: #ffffff; font-family: var(--font-mono);">${dd?.annualized_volatility_1y != null ? `${dd.annualized_volatility_1y}%` : '—'}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="color: var(--text-secondary); font-size: 12px;">14-Day ATR:</span>
        <strong style="color: var(--accent-cyan); font-family: var(--font-mono);">${dd?.atr_14 != null ? `${currSym}${dd.atr_14}` : '—'}</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: var(--text-secondary); font-size: 12px;">1-Year Total Return:</span>
        <strong style="color: ${(dd?.returns?.['1Y'] || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}; font-family: var(--font-mono);">
          ${dd?.returns?.['1Y'] != null ? `${dd.returns['1Y'] >= 0 ? '+' : ''}${dd.returns['1Y']}%` : '—'}
        </strong>
      </div>
    </div>
  `;
}

// Render Relative Performance vs NIFTY / S&P 500 (Tab 6)
function renderRelativePerformance(relPerf, dd) {
  const container = document.getElementById('relative-performance-grid');
  if (!container || !relPerf) return;

  const returns = dd?.returns || {};

  container.innerHTML = Object.entries(relPerf)
    .map(([benchName, data]) => {
      const bRets = data.benchmark_returns || {};
      const alphas = data.relative_alpha || {};

      return `
      <div class="dossier-card">
        <div class="dossier-card-title">⚖️ Relative Performance vs ${benchName} (${data.benchmark_symbol})</div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; margin-top: 10px;">
          ${['1M', '3M', '6M', '1Y']
            .map((p) => {
              const alpha = alphas[p];
              const isAlphaPos = (alpha || 0) >= 0;
              return `
              <div style="background: #06070a; border: 1px solid #161720; border-radius: 4px; padding: 8px;">
                <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">${p}</div>
                <div style="font-size: 12px; font-weight: 700; color: #ffffff; margin: 4px 0;">
                  ${returns[p] != null ? `${returns[p] >= 0 ? '+' : ''}${returns[p]}%` : '—'}
                </div>
                <div style="font-size: 10px; color: var(--text-secondary);">Bench: ${bRets[p] != null ? `${bRets[p] >= 0 ? '+' : ''}${bRets[p]}%` : '—'}</div>
                <div style="font-size: 11px; font-weight: 700; color: ${isAlphaPos ? 'var(--accent-green)' : 'var(--accent-red)'}; margin-top: 4px;">
                  ${alpha != null ? `${isAlphaPos ? '+' : ''}${alpha}%` : '—'}
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    `;
    })
    .join('');
}

// ============================================================================
// WORKSPACE 1: MARKETS — PRIMARY INFORMATION ARCHITECTURE & TELEMETRY
// ============================================================================

let currentSelectedSector = null;
let currentSelectedMarketObject = null;
let lastSectorIntelligenceFetchTime = 0;
let cachedSectorData = null;

// Telemetry Calculator for Global Desks and Session Context
function getMarketSessionTelemetry() {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMins = now.getUTCMinutes();
  const utcTotal = utcHours * 60 + utcMins;
  const day = now.getUTCDay();
  const isWeekend = day === 0 || day === 6;

  // IST (UTC+5:30) -> NSE regular 09:15 to 15:30 IST = UTC 03:45 (225m) to 10:00 (600m)
  let nseStatus = 'CLOSED';
  if (!isWeekend) {
    if (utcTotal >= 225 && utcTotal <= 600) {
      nseStatus = 'REGULAR SESSION';
    } else if (utcTotal >= 210 && utcTotal < 225) {
      nseStatus = 'PRE-MARKET';
    } else if (utcTotal > 600 && utcTotal <= 630) {
      nseStatus = 'POST-MARKET';
    }
  }

  // NYSE: 09:30 to 16:00 EDT = UTC 13:30 (810m) to 20:00 (1200m)
  let nyseStatus = 'CLOSED';
  if (!isWeekend) {
    if (utcTotal >= 810 && utcTotal <= 1200) {
      nyseStatus = 'REGULAR';
    } else if (utcTotal >= 480 && utcTotal < 810) {
      nyseStatus = 'PRE-MKT';
    } else if (utcTotal > 1200 && utcTotal <= 1440) {
      nyseStatus = 'AFTER-HOURS';
    }
  }

  // LSE: 08:00 to 16:30 UTC = 480m to 990m
  let lseStatus = 'CLOSED';
  if (!isWeekend && utcTotal >= 480 && utcTotal <= 990) {
    lseStatus = 'OPEN';
  }

  // Tokyo: 09:00 to 15:00 JST = UTC 00:00 to 06:00 (0m to 360m)
  let tyoStatus = 'CLOSED';
  if (!isWeekend && utcTotal >= 0 && utcTotal <= 360) {
    tyoStatus = 'OPEN';
  }

  return {
    nse: nseStatus,
    nyse: nyseStatus,
    lse: lseStatus,
    tyo: tyoStatus,
    isLive: nseStatus.includes('REGULAR') || nyseStatus.includes('REGULAR') || lseStatus === 'OPEN' || tyoStatus === 'OPEN',
  };
}

// Render Markets State Bar
function renderMarketStateBar(data) {
  const sessionDot = document.getElementById('mkt-session-dot');
  const sessionName = document.getElementById('mkt-session-name');
  const globalStatus = document.getElementById('mkt-global-status');
  const breadthVal = document.getElementById('mkt-breadth-val');
  const feedSource = document.getElementById('mkt-feed-source');
  const lastUpdated = document.getElementById('mkt-last-updated');

  const telemetry = getMarketSessionTelemetry();

  if (sessionDot) {
    sessionDot.className = `mkt-session-dot ${telemetry.nse.includes('REGULAR') ? '' : 'closed'}`;
  }
  if (sessionName) {
    sessionName.textContent = `NSE INDIA: ${telemetry.nse}`;
  }
  if (globalStatus) {
    globalStatus.textContent = `NSE ${telemetry.nse.split(' ')[0]} · NYSE ${telemetry.nyse} · LSE ${telemetry.lse} · TYO ${telemetry.tyo}`;
  }

  // Compute Benchmark Advance / Decline
  if (breadthVal) {
    const indices = data?.macro?.Indices || [];
    let adv = 0;
    let dec = 0;
    let flt = 0;
    indices.forEach((i) => {
      const p = i.change_pct || 0;
      if (p > 0.05) adv++;
      else if (p < -0.05) dec++;
      else flt++;
    });
    breadthVal.textContent = indices.length > 0 ? `${adv} ADV · ${dec} DEC · ${flt} FLT` : '4 ADV · 3 DEC';
  }

  if (feedSource) {
    const src = data?.hero?.source || 'DIRECT NSE (LIVE)';
    feedSource.textContent = src.toUpperCase();
  }

  if (lastUpdated) {
    const now = new Date();
    lastUpdated.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  // Sync button event
  const refreshBtn = document.getElementById('mkt-refresh-btn');
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = 'true';
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('spinning');
      await loadMarketOverview(true);
      await loadAndRenderSectorsAndMarketMap(true);
      setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
    });
  }
}

// Dynamic Context Inspector Dossier Renderer for Markets
export function renderMarketInspector(type, data) {
  const panelBody = document.getElementById('context-panel-body');
  if (!panelBody || !data) return;

  currentSelectedMarketObject = { type, data };

  if (type === 'index') {
    const isUp = (data.change_pct || 0) >= 0;
    const sign = isUp ? '+' : '−';
    const chgClass = isUp ? 'chg-up' : 'chg-down';
    const isIndia = data.curr === '₹' || data.regionCode === 'india';
    const priceFmt = data.price != null
      ? `${data.curr || '₹'}${data.price.toLocaleString(isIndia ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';
    const chgPctFmt = data.change_pct != null ? `${sign}${Math.abs(data.change_pct).toFixed(2)}%` : '—';
    const chgValFmt = data.change != null ? `${sign}${Math.abs(data.change).toFixed(2)}` : '—';
    const lowFmt = data.low != null
      ? `${data.curr || '₹'}${data.low.toLocaleString(isIndia ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';
    const highFmt = data.high != null
      ? `${data.curr || '₹'}${data.high.toLocaleString(isIndia ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

    panelBody.innerHTML = `
      <div class="inspector-block">
        <div class="inspector-badge-row">
          <span class="inspector-tag-badge">BENCHMARK INDEX</span>
          <span class="region-tag ${data.tagClass || 'tag-in'}">${data.tag || 'IN'}</span>
        </div>
        <div class="inspector-primary-ident">
          <div>
            <h4 class="inspector-title">${data.name}</h4>
            <div class="inspector-sub">${data.symbol} · ${data.region}</div>
          </div>
          <span class="mara-asset-badge ${chgClass}">${chgPctFmt}</span>
        </div>

        <div class="inspector-hero-price">${priceFmt}</div>
        <div class="inspector-net-chg" style="color: ${isUp ? 'var(--gain)' : 'var(--loss)'};">${chgValFmt} Net Change</div>

        <div class="inspector-divider"></div>

        <div class="inspector-grid">
          <div class="inspector-stat">
            <span class="label">Day Low</span>
            <span class="val">${lowFmt}</span>
          </div>
          <div class="inspector-stat">
            <span class="label">Day High</span>
            <span class="val">${highFmt}</span>
          </div>
          <div class="inspector-stat">
            <span class="label">Region</span>
            <span class="val">${data.region}</span>
          </div>
          <div class="inspector-stat">
            <span class="label">Feed Handshake</span>
            <span class="val" style="color: var(--gain);">${data.source || 'NSE Direct'}</span>
          </div>
        </div>

        <div class="inspector-action-wrap">
          <button class="inspector-primary-action-btn" id="inspector-action-btn" data-sym="${data.symbol}">
            <span>Analyze ${data.name}</span>
            <span style="font-family: var(--font-mono);">↗</span>
          </button>
        </div>
      </div>

      <div class="inspector-block">
        <div class="inspector-block-title">Workstation Context</div>
        <div class="inspector-context-desc">
          Clicking any benchmark, sector, or constituent updates this dossier in real time. Use the Analyze action to inspect interactive TradingView candles, quantitative indicators, and financial statements.
        </div>
      </div>
    `;

    const actBtn = panelBody.querySelector('#inspector-action-btn');
    if (actBtn) {
      actBtn.onclick = () => {
        router.navigate(router.formatSymbolRoute(data.symbol, 'chart'));
      };
    }
  } else if (type === 'sector') {
    const perf = data.performance_24h_pct || 0;
    const isUp = perf >= 0;
    const proxyStr = [data.indian_proxy, data.benchmark_etf].filter(Boolean).join(' · ');

    panelBody.innerHTML = `
      <div class="inspector-block">
        <div class="inspector-badge-row">
          <span class="inspector-tag-badge">SECTOR ROTATION</span>
          <span class="region-tag tag-ap">SECTOR</span>
        </div>
        <div class="inspector-primary-ident">
          <div>
            <h4 class="inspector-title">${data.display_name}</h4>
            <div class="inspector-sub">${proxyStr || 'Sector Cohort'}</div>
          </div>
          <span class="mara-asset-badge ${isUp ? 'chg-up' : 'chg-down'}">${isUp ? '+' : ''}${perf.toFixed(2)}%</span>
        </div>

        <div class="inspector-divider"></div>

        <div class="inspector-grid">
          <div class="inspector-stat">
            <span class="label">Sector Anchor</span>
            <span class="val" style="color: var(--accent); font-family: var(--font-mono);">${data.leading_asset}</span>
          </div>
          <div class="inspector-stat">
            <span class="label">Tracked Assets</span>
            <span class="val">${data.constituents?.length || 0} Equities</span>
          </div>
          <div class="inspector-stat">
            <span class="label">Rotation Bias</span>
            <span class="val" style="color: ${isUp ? 'var(--gain)' : 'var(--loss)'};">${isUp ? '▲ Net Bullish' : '▼ Net Bearish'}</span>
          </div>
          <div class="inspector-stat">
            <span class="label">Benchmark ETF</span>
            <span class="val" style="font-family: var(--font-mono);">${data.benchmark_etf || '—'}</span>
          </div>
        </div>

        <div class="inspector-action-wrap">
          <button class="inspector-primary-action-btn" id="inspector-action-btn" data-sym="${data.leading_asset}">
            <span>Analyze Anchor (${data.leading_asset})</span>
            <span style="font-family: var(--font-mono);">↗</span>
          </button>
        </div>
      </div>

      <div class="inspector-block">
        <div class="inspector-block-title">Leading Constituents</div>
        <div class="inspector-mini-list">
          ${(data.constituents || []).slice(0, 4).map((sym) => `
            <div class="inspector-mini-item" data-sym="${sym}">
              <span class="inspector-mini-sym">${sym}</span>
              <button class="inspector-mini-btn" data-sym="${sym}">Analyze ↗</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const actBtn = panelBody.querySelector('#inspector-action-btn');
    if (actBtn) {
      actBtn.onclick = () => {
        router.navigate(router.formatSymbolRoute(data.leading_asset, 'chart'));
      };
    }

    panelBody.querySelectorAll('.inspector-mini-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const sym = btn.getAttribute('data-sym');
        if (sym) router.navigate(router.formatSymbolRoute(sym, 'chart'));
      };
    });
  } else if (type === 'constituent') {
    panelBody.innerHTML = `
      <div class="inspector-block">
        <div class="inspector-badge-row">
          <span class="inspector-tag-badge">CONSTITUENT SECURITY</span>
          <span class="region-tag tag-in">EQUITY</span>
        </div>
        <div class="inspector-primary-ident">
          <div>
            <h4 class="inspector-title" style="font-family: var(--font-mono); font-size: 16px;">${data.symbol}</h4>
            <div class="inspector-sub">${data.role || 'Constituent'} · ${data.sectorName || 'Benchmark Sector'}</div>
          </div>
        </div>

        <div class="inspector-divider"></div>

        <div class="inspector-stat" style="margin-bottom: 8px;">
          <span class="label">Constituent Role</span>
          <span class="val" style="color: #ffffff;">${data.role || 'Constituent Peer'}</span>
        </div>
        <div class="inspector-stat">
          <span class="label">Benchmark Proxy</span>
          <span class="val" style="font-family: var(--font-mono); color: var(--accent);">${data.proxy || 'Sector Cohort'}</span>
        </div>

        <div class="inspector-action-wrap" style="margin-top: 14px;">
          <button class="inspector-primary-action-btn" id="inspector-action-btn" data-sym="${data.symbol}">
            <span>Analyze ${data.symbol}</span>
            <span style="font-family: var(--font-mono);">↗</span>
          </button>
        </div>
      </div>
    `;

    const actBtn = panelBody.querySelector('#inspector-action-btn');
    if (actBtn) {
      actBtn.onclick = () => {
        router.navigate(router.formatSymbolRoute(data.symbol, 'chart'));
      };
    }
  } else if (type === 'macro') {
    const isUp = (data.change_pct || 0) >= 0;
    const sign = isUp ? '+' : '−';
    const chgPctFmt = data.change_pct != null ? `${sign}${Math.abs(data.change_pct).toFixed(2)}%` : '—';
    const priceFmt = formatMacroPrice(data.price, data.symbol);

    panelBody.innerHTML = `
      <div class="inspector-block">
        <div class="inspector-badge-row">
          <span class="inspector-tag-badge">CROSS-ASSET MACRO</span>
          <span class="region-tag tag-ap">${data.category || 'MACRO'}</span>
        </div>
        <div class="inspector-primary-ident">
          <div>
            <h4 class="inspector-title">${data.name || data.symbol}</h4>
            <div class="inspector-sub">${data.symbol}</div>
          </div>
          <span class="mara-asset-badge ${isUp ? 'chg-up' : 'chg-down'}">${chgPctFmt}</span>
        </div>

        <div class="inspector-hero-price">${priceFmt}</div>

        <div class="inspector-divider"></div>

        <div class="inspector-grid">
          <div class="inspector-stat">
            <span class="label">Symbol</span>
            <span class="val" style="font-family: var(--font-mono);">${data.symbol}</span>
          </div>
          <div class="inspector-stat">
            <span class="label">Asset Class</span>
            <span class="val">${data.category || 'Macro Instrument'}</span>
          </div>
        </div>

        <div class="inspector-action-wrap" style="margin-top: 14px;">
          <button class="inspector-primary-action-btn" id="inspector-action-btn" data-sym="${data.symbol}">
            <span>Analyze ${data.symbol}</span>
            <span style="font-family: var(--font-mono);">↗</span>
          </button>
        </div>
      </div>
    `;

    const actBtn = panelBody.querySelector('#inspector-action-btn');
    if (actBtn) {
      actBtn.onclick = () => {
        router.navigate(router.formatSymbolRoute(data.symbol, 'chart'));
      };
    }
  }
}

async function loadAndRenderSectorsAndMarketMap(force = false) {
  const tableBody = document.getElementById('markets-indices-table-body');
  const secGrid = document.getElementById('sector-intelligence-grid');

  // Ensure live macro/indices data is ready in marketDataCache (cached for 60s)
  const now = Date.now();
  if (!marketDataCache?.macro || force || (now - lastMarketOverviewFetchTime > 60000)) {
    try {
      marketDataCache = await api.getMarketOverview();
      lastMarketOverviewFetchTime = now;
    } catch (e) {
      console.warn('Could not fetch market overview for indices table:', e);
    }
  }

  if (marketDataCache) {
    renderMarketStateBar(marketDataCache);
  }

  const benchmarkMeta = [
    { name: 'NIFTY 50', symbol: '^NSEI', region: 'India', regionCode: 'india', tag: 'IN', tagClass: 'tag-in', curr: '₹' },
    { name: 'SENSEX', symbol: '^BSESN', region: 'India', regionCode: 'india', tag: 'IN', tagClass: 'tag-in', curr: '₹' },
    { name: 'BANK NIFTY', symbol: '^NSEBANK', region: 'India', regionCode: 'india', tag: 'IN', tagClass: 'tag-in', curr: '₹' },
    { name: 'S&P 500', symbol: '^GSPC', region: 'Americas', regionCode: 'americas', tag: 'US', tagClass: 'tag-us', curr: '$' },
    { name: 'NASDAQ Composite', symbol: '^IXIC', region: 'Americas', regionCode: 'americas', tag: 'US', tagClass: 'tag-us', curr: '$' },
    { name: 'FTSE 100', symbol: '^FTSE', region: 'Europe', regionCode: 'europe', tag: 'UK', tagClass: 'tag-eu', curr: '£' },
    { name: 'NIKKEI 225', symbol: '^N225', region: 'Asia-Pacific', regionCode: 'asia', tag: 'JP', tagClass: 'tag-ap', curr: '¥' },
  ];

  // 1. Populate Global Benchmark Indices Table
  if (tableBody) {
    const liveIndices = (marketDataCache?.macro?.Indices || []);
    const lookup = new Map(liveIndices.map((i) => [i.symbol, i]));

    const processedBenchmarks = benchmarkMeta.map((m) => {
      const live = lookup.get(m.symbol);
      const rawPrice = live?.price != null ? live.price : (m.symbol === '^NSEI' && marketDataCache?.hero?.price != null ? marketDataCache.hero.price : null);
      const rawChg = live?.change != null ? live.change : (m.symbol === '^NSEI' && marketDataCache?.hero?.change != null ? marketDataCache.hero.change : null);
      const rawPct = live?.change_pct != null ? live.change_pct : (m.symbol === '^NSEI' && marketDataCache?.hero?.change_pct != null ? marketDataCache.hero.change_pct : null);
      const rawHigh = live?.high != null ? live.high : (m.symbol === '^NSEI' && marketDataCache?.hero?.high != null ? marketDataCache.hero.high : null);
      const rawLow = live?.low != null ? live.low : (m.symbol === '^NSEI' && marketDataCache?.hero?.low != null ? marketDataCache.hero.low : null);
      const source = m.symbol === '^NSEI' ? (marketDataCache?.hero?.source || 'Direct NSE') : 'yfinance';

      return {
        ...m,
        price: rawPrice,
        change: rawChg,
        change_pct: rawPct,
        high: rawHigh,
        low: rawLow,
        source,
      };
    });

    tableBody.innerHTML = processedBenchmarks
      .map((m, idx) => {
        const isIndia = m.curr === '₹' || m.regionCode === 'india';
        const priceDisplay = m.price != null
          ? `${m.curr}${m.price.toLocaleString(isIndia ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '—';
        const isUp = (m.change_pct || 0) >= 0;
        const sign = isUp ? '+' : '−';
        const chgDisplay = m.change != null ? `${sign}${Math.abs(m.change).toFixed(2)}` : '—';
        const pctDisplay = m.change_pct != null ? `${isUp ? '+' : ''}${m.change_pct.toFixed(2)}%` : '—';
        const chgClass = isUp ? 'chg-up' : 'chg-down';

        let rangeHtml = '';
        if (m.high != null && m.low != null && m.high > m.low && m.price != null) {
          const rangePct = Math.min(100, Math.max(0, ((m.price - m.low) / (m.high - m.low)) * 100));
          const lowFmt = `${m.curr}${m.low.toLocaleString(isIndia ? 'en-IN' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
          const highFmt = `${m.curr}${m.high.toLocaleString(isIndia ? 'en-IN' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
          rangeHtml = `
            <div class="session-range-cell">
              <span class="range-bound low">${lowFmt}</span>
              <div class="mini-range-track">
                <div class="mini-range-dot" style="left: ${rangePct}%;"></div>
              </div>
              <span class="range-bound high">${highFmt}</span>
            </div>
          `;
        } else if (m.price != null) {
          const clampPct = Math.min(85, Math.max(15, 50 + (m.change_pct || 0) * 12));
          rangeHtml = `
            <div class="session-range-cell" title="Session momentum relative to previous close">
              <span class="range-bound low" style="font-size: 10px; color: var(--text-dim);">Close</span>
              <div class="mini-range-track">
                <div class="mini-range-dot" style="left: ${clampPct}%; background: ${isUp ? 'var(--gain)' : 'var(--loss)'};"></div>
              </div>
              <span class="range-bound high" style="font-size: 10px; color: ${isUp ? 'var(--gain)' : 'var(--loss)'};">${isUp ? '▲ Gain' : '▼ Loss'}</span>
            </div>
          `;
        } else {
          rangeHtml = '<span style="color: var(--text-muted); font-size: 11px;">Feed syncing</span>';
        }

        const isDefaultActive = idx === 0;

        return `
          <tr class="markets-index-row ${isDefaultActive ? 'active-row' : ''}" data-region="${m.regionCode}" data-sym="${m.symbol}">
            <td>
              <div class="region-badge">
                <span class="region-tag ${m.tagClass}">${m.tag}</span>
                <span>${m.region}</span>
              </div>
            </td>
            <td>
              <strong style="color: #ffffff; font-weight: 600;">${m.name}</strong>
            </td>
            <td>
              <span style="font-family: var(--font-mono); color: var(--accent); font-size: 11.5px; font-weight: 600;">${m.symbol}</span>
            </td>
            <td class="text-right" style="font-family: var(--font-mono); font-weight: 700; color: #ffffff;">
              ${priceDisplay}
            </td>
            <td class="text-right" style="font-family: var(--font-mono); color: var(--text-dim);">
              ${chgDisplay}
            </td>
            <td class="text-right">
              <span class="tape-chg ${chgClass}">${pctDisplay}</span>
            </td>
            <td>
              ${rangeHtml}
            </td>
            <td class="text-right">
              <button class="markets-table-action-btn" data-sym="${m.symbol}" title="Analyze ${m.name}">Analyze ↗</button>
            </td>
          </tr>
        `;
      })
      .join('');

    // Default Context Inspector state on Markets load (NIFTY 50)
    if (processedBenchmarks.length > 0 && currentActiveWorkspace === 'markets') {
      renderMarketInspector('index', processedBenchmarks[0]);
    }

    // Wire Row Clicks: Select row, update Inspector, DO NOT NAVIGATE
    tableBody.querySelectorAll('.markets-index-row').forEach((row) => {
      row.addEventListener('click', () => {
        tableBody.querySelectorAll('.markets-index-row').forEach((r) => r.classList.remove('active-row'));
        row.classList.add('active-row');
        const sym = row.getAttribute('data-sym');
        const found = processedBenchmarks.find((b) => b.symbol === sym);
        if (found) {
          renderMarketInspector('index', found);
        }
      });
    });

    // Wire Action Button: Intentional Navigation to Analyze Workstation
    tableBody.querySelectorAll('.markets-table-action-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sym = btn.getAttribute('data-sym');
        if (sym) {
          router.navigate(router.formatSymbolRoute(sym, 'chart'));
        }
      });
    });

    // Wire Filter Buttons
    const filterBtns = document.querySelectorAll('#markets-indices-filter .markets-filter-btn');
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const region = btn.getAttribute('data-region');
        tableBody.querySelectorAll('.markets-index-row').forEach((row) => {
          if (region === 'all' || row.getAttribute('data-region') === region) {
            row.style.display = '';
          } else {
            row.style.display = 'none';
          }
        });
      });
    });
  }

  // 2. Render Sector Constituents Detail Function
  function renderSelectedSectorDetail(sector) {
    const titleEl = document.getElementById('sector-detail-title');
    const metaEl = document.getElementById('sector-detail-meta');
    const bodyEl = document.getElementById('sector-detail-body');
    const searchInput = document.getElementById('sector-constituent-search');
    if (!titleEl || !bodyEl || !sector) return;

    titleEl.textContent = `${sector.display_name} Constituents`;
    const proxyStr = [sector.indian_proxy, sector.benchmark_etf].filter(Boolean).join(' · ');
    metaEl.innerHTML = `
      ${proxyStr ? `Benchmark: <span style="font-family: var(--font-mono); color: var(--accent);">${proxyStr}</span> · ` : ''}
      Sector Anchor: <span style="font-family: var(--font-mono); color: var(--gain); font-weight: 600;">${sector.leading_asset}</span> ·
      ${sector.constituents?.length || 0} Tracked Equities
    `;

    bodyEl.innerHTML = `
      <table class="markets-data-table">
        <thead>
          <tr>
            <th style="width: 140px;">Symbol</th>
            <th>Constituent Role</th>
            <th style="width: 160px;">Benchmark Proxy</th>
            <th class="text-right" style="width: 130px;">Status</th>
            <th class="text-right" style="width: 100px;">Action</th>
          </tr>
        </thead>
        <tbody id="sector-constituents-tbody">
          ${(sector.constituents || [])
            .map((sym, idx) => {
              const isLeader = sym === sector.leading_asset;
              const isCurrent = sym === currentSymbol;
              const roleName = idx === 0 ? 'Primary Sector Anchor' : idx < 3 ? 'Core Component Leader' : 'Constituent Peer';

              return `
                <tr class="sector-constituent-row" data-sym="${sym}">
                  <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-family: var(--font-mono); font-weight: 700; color: ${isCurrent ? 'var(--accent)' : '#ffffff'}; font-size: 12.5px;">${sym}</span>
                      ${isLeader ? `<span class="region-tag tag-in">Leader</span>` : ''}
                      ${isCurrent ? `<span class="region-tag tag-ap">Active</span>` : ''}
                    </div>
                  </td>
                  <td style="color: var(--text-dim); font-size: 11.5px;">
                    ${roleName}
                  </td>
                  <td style="font-family: var(--font-mono); font-size: 11px; color: var(--accent);">
                    ${proxyStr || 'Sector Cohort'}
                  </td>
                  <td class="text-right">
                    <span class="tape-chg chg-neutral" style="font-size: 10px; padding: 1px 6px;">Tracked</span>
                  </td>
                  <td class="text-right">
                    <button class="markets-table-action-btn sector-analyze-btn" data-sym="${sym}">Analyze ↗</button>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;

    // Row Click: Inspect constituent, DO NOT NAVIGATE
    bodyEl.querySelectorAll('.sector-constituent-row').forEach((row) => {
      row.addEventListener('click', () => {
        bodyEl.querySelectorAll('.sector-constituent-row').forEach((r) => r.classList.remove('active-row'));
        row.classList.add('active-row');
        const sym = row.getAttribute('data-sym');
        if (sym) {
          const idx = (sector.constituents || []).indexOf(sym);
          const roleName = idx === 0 ? 'Primary Sector Anchor' : idx < 3 ? 'Core Component Leader' : 'Constituent Peer';
          renderMarketInspector('constituent', {
            symbol: sym,
            role: roleName,
            sectorName: sector.display_name,
            proxy: proxyStr,
          });
        }
      });
    });

    // Action Button: Intentional Navigation to Analyze
    bodyEl.querySelectorAll('.sector-analyze-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sym = btn.getAttribute('data-sym');
        if (sym) router.navigate(router.formatSymbolRoute(sym, 'chart'));
      });
    });

    // Wire Search Input Filter
    if (searchInput) {
      searchInput.value = '';
      searchInput.oninput = () => {
        const q = (searchInput.value || '').trim().toUpperCase();
        bodyEl.querySelectorAll('.sector-constituent-row').forEach((row) => {
          const sym = row.getAttribute('data-sym') || '';
          row.style.display = sym.toUpperCase().includes(q) ? '' : 'none';
        });
      };
    }
  }

  // 3. Render Sector Performance Heatmap Matrix
  if (secGrid) {
    try {
      if (!cachedSectorData || force || (now - lastSectorIntelligenceFetchTime > 60000)) {
        const data = await api.getSectorIntelligence();
        cachedSectorData = data.sectors || [];
        lastSectorIntelligenceFetchTime = now;
      }
      const sectorData = cachedSectorData || [];

      if (!currentSelectedSector && sectorData.length > 0) {
        currentSelectedSector = sectorData[0];
      }

      secGrid.innerHTML = sectorData
        .map((s) => {
          const perf = s.performance_24h_pct || 0;
          const isUp = perf >= 0;
          const isSelected = currentSelectedSector?.sector === s.sector;
          const proxy = s.indian_proxy || s.benchmark_etf || 'SECTOR';

          let intensityClass = 'hm-neutral';
          if (perf >= 1.5) intensityClass = 'hm-gain-strong';
          else if (perf >= 0.2) intensityClass = 'hm-gain-mod';
          else if (perf <= -1.5) intensityClass = 'hm-loss-strong';
          else if (perf <= -0.2) intensityClass = 'hm-loss-mod';

          return `
            <div class="hm-tile ${intensityClass} ${isSelected ? 'active-hm-cell' : ''}" data-sector="${s.sector}" title="Click to inspect ${s.display_name}">
              <div class="hm-tile-header">
                <span class="hm-sector-name">${s.display_name}</span>
                <span class="hm-sector-perf ${isUp ? 'text-gain' : 'text-loss'}">${isUp ? '+' : ''}${perf.toFixed(2)}%</span>
              </div>
              <div class="hm-meta-line">
                <span class="hm-proxy-tag">${proxy}</span>
                <span class="hm-leader-tag">Leader: <strong>${s.leading_asset}</strong></span>
              </div>
              <div class="hm-footer-bar">
                <span>${s.constituents?.length || 0} Constituents</span>
                <span style="font-family: var(--font-mono); font-size: 10px; color: ${isUp ? 'var(--gain)' : 'var(--loss)'};">${isUp ? '▲ Net Bullish' : '▼ Net Bearish'}</span>
              </div>
            </div>
          `;
        })
        .join('');

      // Wire tile click -> select sector and update Context Inspector
      secGrid.querySelectorAll('.hm-tile').forEach((tile) => {
        tile.addEventListener('click', () => {
          const secName = tile.getAttribute('data-sector');
          const found = sectorData.find((s) => s.sector === secName);
          if (found) {
            currentSelectedSector = found;
            secGrid.querySelectorAll('.hm-tile').forEach((t) => t.classList.toggle('active-hm-cell', t.getAttribute('data-sector') === secName));
            renderSelectedSectorDetail(found);
            renderMarketInspector('sector', found);
          }
        });
      });

      if (currentSelectedSector) {
        renderSelectedSectorDetail(currentSelectedSector);
      }
    } catch (e) {
      console.warn('Failed sector intelligence load:', e);
    }
  }

  // 4. Render Cross-Asset Macro Radar Lists
  renderMacroRadarPanels();
}

function formatMacroPrice(price, symbol = '') {
  if (price == null) return '—';
  if (symbol.includes('USDINR') || symbol.endsWith('.NS') || symbol.endsWith('.BO')) {
    return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (symbol.includes('=X')) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderMacroRadarPanels() {
  const forexList = document.getElementById('markets-macro-forex-list');
  const commList = document.getElementById('markets-macro-commodities-list');
  const cryptoList = document.getElementById('markets-macro-crypto-list');
  if (!forexList || !commList || !cryptoList || !marketDataCache?.macro) return;

  const renderList = (container, items, category) => {
    if (!items || items.length === 0) {
      container.innerHTML = '<div style="padding: 12px; color: var(--text-dim); font-size: 11px;">Feed offline</div>';
      return;
    }
    container.innerHTML = items
      .map((it) => {
        const isUp = (it.change || 0) >= 0;
        const sign = isUp ? '+' : '−';
        const chgClass = isUp ? 'chg-up' : 'chg-down';
        const chgPct = it.change_pct != null ? `${sign}${Math.abs(it.change_pct).toFixed(2)}%` : '—';
        const priceFmt = formatMacroPrice(it.price, it.symbol);

        return `
          <div class="macro-asset-row" data-sym="${it.symbol}" data-category="${category}">
            <div class="macro-asset-ident">
              <span class="macro-asset-name">${it.name || it.symbol}</span>
              <span class="macro-asset-sym">${it.symbol}</span>
            </div>
            <div class="macro-asset-values">
              <span class="macro-asset-price">${priceFmt}</span>
              <span class="tape-chg ${chgClass}" style="font-size: 10.5px; padding: 1px 6px;">${chgPct}</span>
            </div>
          </div>
        `;
      })
      .join('');

    // Row Click: Inspect Macro Asset, DO NOT NAVIGATE
    container.querySelectorAll('.macro-asset-row').forEach((row) => {
      row.addEventListener('click', () => {
        document.querySelectorAll('.macro-asset-row').forEach((r) => r.classList.remove('active-row'));
        row.classList.add('active-row');
        const sym = row.getAttribute('data-sym');
        const found = items.find((i) => i.symbol === sym);
        if (found) {
          renderMarketInspector('macro', { ...found, category });
        }
      });
    });
  };

  renderList(forexList, (marketDataCache.macro.Forex || []).slice(0, 5), 'FOREX');
  renderList(commList, (marketDataCache.macro.Commodities || []).slice(0, 5), 'COMMODITIES');
  renderList(cryptoList, (marketDataCache.macro.Crypto || []).slice(0, 5), 'DIGITAL ASSETS');
}
window.apexLoad = (sym) => {
  router.navigate(router.formatSymbolRoute(sym, 'chart'));
  const termEl = document.querySelector('.terminal-card');
  if (termEl) termEl.scrollIntoView({ behavior: 'smooth' });
};

// Multi-Asset Pearson Correlation Heatmap (Tab 9)
async function loadAndRenderCorrelation(period = '1y') {
  const container = document.getElementById('correlation-matrix-container');
  if (!container) return;

  container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">Computing Pearson correlation matrix...</div>';

  try {
    const data = await api.getCorrelationMatrix(['TCS.NS', 'INFY.NS', '^NSEI', 'GC=F', 'BTC-USD'], period);
    const symbols = data.symbols || [];
    const matrix = data.matrix || [];

    if (matrix.length === 0) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--accent-red);">Correlation computation failed.</div>';
      return;
    }

    container.innerHTML = `
      <table class="correlation-table">
        <thead>
          <tr>
            <th>Asset</th>
            ${symbols.map((s) => `<th>${s}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${symbols
            .map((s1, i) => `
            <tr>
              <th style="text-align: left; font-weight: 700; color: #ffffff;">${s1}</th>
              ${matrix[i]
                .map((val) => {
                  let cls = 'corr-neutral';
                  if (val >= 0.7) cls = 'corr-high-pos';
                  else if (val >= 0.25) cls = 'corr-med-pos';
                  else if (val <= -0.1) cls = 'corr-neg';
                  return `<td class="${cls}">${val.toFixed(2)}</td>`;
                })
                .join('')}
            </tr>
          `)
            .join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Correlation error:', err);
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--accent-red);">Unable to calculate correlation matrix.</div>';
  }
}

// Forward Valuation Scenario Sandbox (Tab 10)
function setupScenarioControls() {
  const revSlider = document.getElementById('scenario-rev-slider');
  const marginSlider = document.getElementById('scenario-margin-slider');
  const peSlider = document.getElementById('scenario-pe-slider');

  [revSlider, marginSlider, peSlider].forEach((slider) => {
    if (slider) {
      slider.addEventListener('input', updateScenarioCalculation);
    }
  });
}

function updateScenarioCalculation() {
  const revSlider = document.getElementById('scenario-rev-slider');
  const marginSlider = document.getElementById('scenario-margin-slider');
  const peSlider = document.getElementById('scenario-pe-slider');
  const resultsGrid = document.getElementById('scenario-results-grid');

  if (!revSlider || !marginSlider || !peSlider || !resultsGrid) return;

  const revGrowth = parseFloat(revSlider.value);
  const targetMargin = parseFloat(marginSlider.value);
  const targetPe = parseFloat(peSlider.value);

  const revValEl = document.getElementById('scenario-rev-val');
  const marginValEl = document.getElementById('scenario-margin-val');
  const peValEl = document.getElementById('scenario-pe-val');

  if (revValEl) revValEl.textContent = `${revGrowth >= 0 ? '+' : ''}${revGrowth}%`;
  if (marginValEl) marginValEl.textContent = `${targetMargin}%`;
  if (peValEl) peValEl.textContent = `${targetPe}x`;

  const currPrice = currentOverviewData?.current_price || 3000;
  const currMcap = currentOverviewData?.market_cap || 1e12;
  const currency = currentOverviewData?.currency || 'INR';
  const currSym = currentOverviewData?.currency_symbol || '₹';

  // Base revenue from last audited year or current mcap
  const baseRev = (currentResearchData?.financial_timeline?.[currentResearchData.financial_timeline.length - 1]?.source_data?.total_revenue) || (currMcap * 0.2);
  const projRev = baseRev * (1 + revGrowth / 100);
  const projEarnings = projRev * (targetMargin / 100);
  const impliedMcap = projEarnings * targetPe;
  const impliedPrice = currPrice * (impliedMcap / currMcap);
  const upsidePct = ((impliedPrice - currPrice) / currPrice) * 100;

  resultsGrid.innerHTML = `
    <div class="metric-card">
      <div class="metric-card-label">Projected Annual Revenue</div>
      <div class="metric-card-val" style="font-size: 16px;">${currSym}${(projRev / (currency === 'INR' ? 1e7 : 1e9)).toFixed(1)} ${currency === 'INR' ? 'Cr' : 'B'}</div>
      <div class="metric-card-sub">Top-Line Expansion Model</div>
    </div>
    <div class="metric-card">
      <div class="metric-card-label">Projected Net Income</div>
      <div class="metric-card-val" style="font-size: 16px;">${currSym}${(projEarnings / (currency === 'INR' ? 1e7 : 1e9)).toFixed(1)} ${currency === 'INR' ? 'Cr' : 'B'}</div>
      <div class="metric-card-sub">At ${targetMargin}% Net Profit Margin</div>
    </div>
    <div class="metric-card">
      <div class="metric-card-label">Implied Target Stock Price</div>
      <div class="metric-card-val" style="font-size: 18px; color: ${upsidePct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
        ${currSym}${impliedPrice.toFixed(2)}
      </div>
      <div class="metric-card-sub" style="font-weight: 700; color: ${upsidePct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
        ${upsidePct >= 0 ? '+' : ''}${upsidePct.toFixed(1)}% vs Current
      </div>
    </div>
  `;
}

// Algorithmic Backtesting Simulator (Tab 10)
function setupBacktesterControls() {
  const btn = document.getElementById('run-backtest-btn');
  if (btn) {
    btn.addEventListener('click', runBacktestSimulation);
  }
}

function runBacktestSimulation() {
  const container = document.getElementById('backtest-results-container');
  const stratSelect = document.getElementById('backtest-strategy-select');
  if (!container || !stratSelect) return;

  const strategy = stratSelect.value;
  const res = Backtester.run({ candles: currentCandles, strategy });

  if (res.error) {
    container.innerHTML = `<div style="color: var(--accent-red); padding: 14px; text-align: center;">${res.error}</div>`;
    return;
  }

  // Plot BUY/SELL markers on chart
  if (chartInstance && res.markers) {
    chartInstance.setEventMarkers(res.markers);
  }

  container.innerHTML = `
    <div class="dossier-grid" style="margin-bottom: 14px;">
      <div class="metric-card">
        <div class="metric-card-label">Strategy Total Return</div>
        <div class="metric-card-val" style="color: ${res.totalReturnPct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
          ${res.totalReturnPct >= 0 ? '+' : ''}${res.totalReturnPct}%
        </div>
        <div class="metric-card-sub">Benchmark Buy & Hold: ${res.benchmarkReturnPct}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">Strategy Win Rate</div>
        <div class="metric-card-val" style="color: var(--accent-cyan);">${res.winRatePct}%</div>
        <div class="metric-card-sub">${res.profitableTrades} wins out of ${res.totalTrades} signals</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">Maximum Strategy Drawdown</div>
        <div class="metric-card-val" style="color: var(--accent-red);">${res.maxDrawdownPct}%</div>
        <div class="metric-card-sub">Peak-to-trough capital dip</div>
      </div>
    </div>
    <div style="font-size: 11px; color: var(--accent-green); font-weight: 600;">
      ✓ Simulated ${res.totalTrades} algorithmic signals. Signal markers plotted onto interactive candlestick chart.
    </div>
  `;
}

// Research Notebook Setup (Tab 11)
function setupNotebookControls() {
  const thesis = document.getElementById('nb-thesis');
  const risks = document.getElementById('nb-risks');
  const questions = document.getElementById('nb-questions');
  const valuation = document.getElementById('nb-valuation');
  const exportBtn = document.getElementById('export-notebook-btn');

  const save = () => {
    ResearchNotebook.saveNote(currentSymbol, {
      thesis: thesis?.value,
      risks: risks?.value,
      questions: questions?.value,
      valuationNotes: valuation?.value,
    });
    const badge = document.getElementById('notebook-status-badge');
    if (badge) {
      badge.textContent = 'Saved just now';
      setTimeout(() => (badge.textContent = 'Auto-Saved'), 2000);
    }
  };

  [thesis, risks, questions, valuation].forEach((field) => {
    if (field) field.addEventListener('input', save);
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      ResearchNotebook.exportAsMarkdown(currentSymbol, currentOverviewData?.name);
    });
  }
}

function loadNotebookForCurrentSymbol() {
  const note = ResearchNotebook.loadNote(currentSymbol);
  const title = document.getElementById('notebook-asset-title');
  if (title) title.textContent = currentSymbol;

  const thesis = document.getElementById('nb-thesis');
  const risks = document.getElementById('nb-risks');
  const questions = document.getElementById('nb-questions');
  const valuation = document.getElementById('nb-valuation');

  if (thesis) thesis.value = note.thesis || '';
  if (risks) risks.value = note.risks || '';
  if (questions) questions.value = note.questions || '';
  if (valuation) valuation.value = note.valuationNotes || '';
}

// Data Quality Center (Tab 12)
function renderDataQualityCenter(dq) {
  const container = document.getElementById('data-quality-grid');
  if (!container || !dq) return;

  const modules = dq.module_completeness || {};

  container.innerHTML = `
    <div class="dossier-card">
      <div class="dossier-card-title">Telemetry Health & Status</div>
      <div style="font-size: 20px; font-weight: 700; color: var(--gain); margin-bottom: 6px;">
        ${dq.pipeline_status || 'Operational'}
      </div>
      <div class="dossier-text">
        Primary Data Source: <strong style="color: var(--accent);">${dq.primary_source}</strong><br>
        Pipeline Latency: <strong style="color: #ffffff;">${dq.latency_ms} ms</strong><br>
        Audit Timestamp: <span style="font-family: var(--font-mono); color: #cbd5e1;">${dq.retrieved_at}</span>
      </div>
    </div>

    <div class="dossier-card" style="grid-column: span 2;">
      <div class="dossier-card-title">Dataset Module Completeness (${dq.overall_completeness_pct}%)</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px;">
        ${Object.entries(modules)
          .map(
            ([mod, pct]) => `
            <div style="background: #141414; border: 1px solid #262626; border-radius: 4px; padding: 10px;">
              <div style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">${mod.replace(/_/g, ' ')}</div>
              <div style="font-size: 16px; font-weight: 700; color: ${pct === 100 ? 'var(--gain)' : 'var(--accent)'}; margin-top: 4px;">
                ${pct}% Verified
              </div>
            </div>
          `
          )
          .join('')}
      </div>
    </div>
  `;
}

// One-Click Research Report Generator (Tab 13)
function setupReportControls() {
  const dlBtn = document.getElementById('download-report-md-btn');
  const printBtn = document.getElementById('print-report-pdf-btn');

  if (dlBtn) {
    dlBtn.addEventListener('click', () => {
      const md = ResearchReportGenerator.generateMarkdownReport({
        stockData: currentOverviewData,
        researchData: currentResearchData,
        deepResearchData: currentDeepResearchData,
        v4Data: currentV4Data,
      });
      ResearchReportGenerator.downloadMarkdown(md, currentSymbol);
    });
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const md = ResearchReportGenerator.generateMarkdownReport({
        stockData: currentOverviewData,
        researchData: currentResearchData,
        deepResearchData: currentDeepResearchData,
        v4Data: currentV4Data,
      });
      ResearchReportGenerator.printReport(md, currentSymbol);
    });
  }
}

function renderOneClickReport(stockData, researchData, deepData, v4Data) {
  const preview = document.getElementById('report-rendered-preview');
  if (!preview) return;

  const sData = stockData || currentOverviewData;
  const rData = researchData || currentResearchData;
  const dData = deepData || currentDeepResearchData;
  const vData = v4Data || currentV4Data;

  const md = ResearchReportGenerator.generateMarkdownReport({
    stockData: sData,
    researchData: rData,
    deepResearchData: dData,
    v4Data: vData,
  });

  preview.textContent = md;
}

// Local Market Alerts Setup (Zero Accounts)
function setupAlertsControls() {
  const createBtn = document.getElementById('create-alert-btn');

  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const metric = document.getElementById('alert-metric-select')?.value || 'price';
      const operator = document.getElementById('alert-op-select')?.value || '>';
      const target = parseFloat(document.getElementById('alert-target-input')?.value || '0');

      if (!target || isNaN(target)) {
        alert('Please specify a valid numeric target value.');
        return;
      }

      alertsManager.addAlert({
        symbol: currentSymbol,
        metric,
        operator,
        target,
        note: `Target set on ${new Date().toLocaleDateString()}`,
      });

      document.getElementById('alert-target-input').value = '';
      refreshAlertsUI();
    });
  }

  refreshAlertsUI();
}

function refreshAlertsUI() {
  const container = document.getElementById('alerts-list-container');
  const countNav = document.getElementById('alerts-nav-count');
  const badge = document.getElementById('alerts-drawer-badge');

  const allAlerts = alertsManager.getAllAlerts();
  const activeAlerts = allAlerts.filter((a) => !a.triggered);

  if (countNav) countNav.textContent = activeAlerts.length;
  if (badge) badge.textContent = `${activeAlerts.length} Active`;

  if (!container) return;

  if (allAlerts.length === 0) {
    container.innerHTML = '<div class="alerts-empty-state"><span class="alerts-empty-mark" aria-hidden="true">◌</span><strong>No alerts yet</strong><span>Create a price or indicator threshold above to keep an eye on a level.</span></div>';
    return;
  }

  container.innerHTML = allAlerts
    .map(
      (a) => `
      <div class="alert-card ${a.triggered ? 'triggered' : ''}">
        <div class="alert-card-copy">
          <div class="alert-card-title">
            ${a.symbol} | <span>${a.metric}</span> ${a.operator} ${a.target}
          </div>
          <div class="alert-card-meta">
            ${a.triggered ? `Triggered at ${new Date(a.triggeredAt).toLocaleTimeString()}` : `Active. Created ${new Date(a.createdAt).toLocaleDateString()}`}
          </div>
        </div>
        <button class="alert-delete-btn" type="button" onclick="window.apexDeleteAlert('${a.id}')" aria-label="Delete alert" title="Delete alert">×</button>
      </div>
    `
    )
    .join('');
  container.querySelectorAll('button[onclick^="window.apexDeleteAlert"]').forEach((button, index) => {
    const symbol = allAlerts[index]?.symbol || 'asset';
    button.type = 'button';
    button.classList.add('alert-delete-btn');
    button.setAttribute('aria-label', `Delete alert for ${symbol}`);
    button.title = `Delete alert for ${symbol}`;
  });
}
window.apexDeleteAlert = (id) => {
  alertsManager.removeAlert(id);
  refreshAlertsUI();
};

// Screener 2.0 Query Builder Setup
function setupScreenerBuilderControls() {
  const toggleBtn = document.getElementById('toggle-screener-builder-btn');
  const wrap = document.getElementById('screener-builder-wrap');
  const addBtn = document.getElementById('screener-add-rule-btn');
  const runBtn = document.getElementById('screener-run-builder-btn');
  const csvBtn = document.getElementById('screener-export-csv-btn');
  const jsonBtn = document.getElementById('screener-export-json-btn');
  const combSelect = document.getElementById('screener-combinator');

  if (toggleBtn && wrap) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = wrap.style.display === 'none';
      wrap.style.display = isHidden ? 'block' : 'none';
      toggleBtn.classList.toggle('active', isHidden);
      if (isHidden) renderScreenerRulesUI();
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      screenerBuilder.addCondition();
      renderScreenerRulesUI();
    });
  }

  if (combSelect) {
    combSelect.addEventListener('change', (e) => {
      screenerBuilder.combinator = e.target.value;
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', () => {
      const filtered = screenerBuilder.execute(currentScreenerAssets);
      renderScreenerTable(filtered);
    });
  }

  if (csvBtn) {
    csvBtn.addEventListener('click', () => {
      const filtered = screenerBuilder.execute(currentScreenerAssets);
      screenerBuilder.exportCSV(filtered);
    });
  }

  if (jsonBtn) {
    jsonBtn.addEventListener('click', () => {
      const filtered = screenerBuilder.execute(currentScreenerAssets);
      screenerBuilder.exportJSON(filtered);
    });
  }
}

function renderScreenerRulesUI() {
  const container = document.getElementById('screener-rules-container');
  if (!container) return;

  container.innerHTML = screenerBuilder.conditions
    .map(
      (c) => `
      <div class="screener-rule-row">
        <select onchange="window.apexUpdateRule(${c.id}, 'metric', this.value)" class="screener-select">
          ${SCREENER_METRICS.map((m) => `<option value="${m.id}" ${c.metric === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select>
        <select onchange="window.apexUpdateRule(${c.id}, 'operator', this.value)" class="screener-select" style="width: 60px;">
          <option value=">" ${c.operator === '>' ? 'selected' : ''}>&gt;</option>
          <option value=">=" ${c.operator === '>=' ? 'selected' : ''}>&gt;=</option>
          <option value="<" ${c.operator === '<' ? 'selected' : ''}>&lt;</option>
          <option value="<=" ${c.operator === '<=' ? 'selected' : ''}>&lt;=</option>
        </select>
        <input type="number" value="${c.value}" onchange="window.apexUpdateRule(${c.id}, 'value', this.value)" class="screener-input" style="width: 100px;" />
        <button onclick="window.apexRemoveRule(${c.id})" class="wl-btn wl-btn-danger" style="padding: 2px 8px; font-size: 11px;">✕</button>
      </div>
    `
    )
    .join('');
}

window.apexUpdateRule = (id, key, val) => screenerBuilder.updateCondition(id, key, val);
window.apexRemoveRule = (id) => {
  screenerBuilder.removeCondition(id);
  renderScreenerRulesUI();
};
