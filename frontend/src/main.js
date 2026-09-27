/**
 * Apex Financial Terminal - Frontend Controller
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

let chartInstance = null;
let currentSymbol = 'TCS.NS';
let currentTimeframe = '1y';
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

// Rapid ticker switching race condition guard
let currentLoadToken = 0;

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

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  const chartContainer = document.getElementById('tv-chart-container');
  const legendBox = document.getElementById('chart-legend-box');

  if (chartContainer) {
    chartInstance = new TerminalChart(chartContainer, legendBox);
  }

  setupEventListeners();
  setupTradingViewChromeControls();
  setupWatchlistControls();

  await loadMarketOverview();
  await loadStock(currentSymbol, currentTimeframe);
  await loadScreener('indian_leaders');
  await refreshWatchlistUI();
});

// Setup DOM Event Listeners
function setupEventListeners() {
  // Brand Home Click
  const brandBtn = document.getElementById('brand-home-btn');
  if (brandBtn) {
    brandBtn.addEventListener('click', () => {
      loadStock('^NSEI', '1y');
    });
  }

  // Workspace Navigation Tabs
  const wsTabs = document.querySelectorAll('.ws-tab-btn');
  wsTabs.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      wsTabs.forEach((b) => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      const targetTab = targetBtn.getAttribute('data-tab');
      document.querySelectorAll('.research-view-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `panel-${targetTab}`);
      });
      if (targetTab === 'chart' && chartInstance) {
        window.dispatchEvent(new Event('resize'));
      }
      if (targetTab === 'report') {
        renderOneClickReport(currentOverviewData, currentResearchData, currentDeepResearchData, currentV4Data);
      }
      if (targetTab === 'sectors') {
        loadAndRenderSectorsAndMarketMap();
      }
      if (targetTab === 'correlation') {
        loadAndRenderCorrelation(activeCorrelationPeriod);
        loadAndRenderMacroExplorer(currentSymbol);
      }
      if (targetTab === 'whatchanged' && currentV4Data) {
        renderWhatChanged(currentV4Data.what_changed_30d);
      }
      if (targetTab === 'anomalies' && currentV4Data) {
        renderAnomalies(currentV4Data.anomalies);
      }
      if (targetTab === 'notebook') {
        loadNotebookForCurrentSymbol();
      }
      if (targetTab === 'lab') {
        updateScenarioCalculation();
      }
    });
  });

  // Screener Universe Tabs
  const screenerTabs = document.querySelectorAll('.screener-tab-btn');
  screenerTabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      screenerTabs.forEach((t) => t.classList.remove('active'));
      e.target.classList.add('active');
      const universe = e.target.getAttribute('data-universe');
      loadScreener(universe);
    });
  });

  // Timeframe Buttons
  const tfButtons = document.querySelectorAll('.tf-btn');
  tfButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      tfButtons.forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      currentTimeframe = e.target.getAttribute('data-tf');
      const tvLegInterval = document.getElementById('tv-leg-interval');
      if (tvLegInterval) tvLegInterval.textContent = currentTimeframe.toUpperCase();
      loadStockChart(currentSymbol, currentTimeframe);
    });
  });

  // Indicator Toggle Buttons
  const indButtons = document.querySelectorAll('.ind-btn');
  indButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const indName = e.target.getAttribute('data-ind');
      const isActive = e.target.classList.toggle('active');
      if (chartInstance) {
        chartInstance.toggleIndicator(indName, isActive);
      }
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
      const query = e.target.value.trim();

      if (query.length === 0) {
        searchDropdown.classList.remove('open');
        return;
      }

      searchDebounceTimer = setTimeout(async () => {
        try {
          const res = await api.searchAssets(query);
          renderSearchDropdown(res.results || []);
        } catch (err) {
          console.error('Search query failed:', err);
        }
      }, 200);
    });

    // Close search dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
        searchDropdown.classList.remove('open');
      }
    });
  }

  // Chart Event Markers Toggle
  const toggleEventsBtn = document.getElementById('toggle-events-marker-btn');
  if (toggleEventsBtn) {
    toggleEventsBtn.addEventListener('click', () => {
      showChartEvents = !showChartEvents;
      toggleEventsBtn.classList.toggle('active', showChartEvents);
      updateChartEventMarkers();
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

  // Global ⌘K / Ctrl+K Shortcut to Search
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const searchInput = document.getElementById('global-search-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
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

  // 2. Indicators Dropdown Menu
  const indMenuBtn = document.getElementById('tv-indicators-menu-btn');
  const indMenu = document.getElementById('tv-indicators-menu');
  const railIndBtn = document.getElementById('tv-rail-indicators');

  const toggleIndMenu = (e) => {
    e.stopPropagation();
    indMenu?.classList.toggle('open');
  };

  if (indMenuBtn) indMenuBtn.addEventListener('click', toggleIndMenu);
  if (railIndBtn) railIndBtn.addEventListener('click', toggleIndMenu);

  document.addEventListener('click', (e) => {
    if (indMenu && !indMenu.contains(e.target) && e.target !== indMenuBtn && e.target !== railIndBtn) {
      indMenu.classList.remove('open');
    }
  });

  // Indicator dropdown items
  const indItems = document.querySelectorAll('.tv-dropdown-item[data-ind]');
  indItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      const indName = item.getAttribute('data-ind');
      const isActive = item.classList.toggle('active');
      const checkIcon = item.querySelector('.tv-check-icon');
      if (checkIcon) checkIcon.textContent = isActive ? '✓' : '';
      if (chartInstance) {
        chartInstance.toggleIndicator(indName, isActive);
      }
    });
  });

  // Corporate events item in indicator dropdown
  const eventsItem = document.getElementById('tv-toggle-events-item');
  if (eventsItem) {
    eventsItem.addEventListener('click', () => {
      const isActive = eventsItem.classList.toggle('active');
      const checkIcon = eventsItem.querySelector('.tv-check-icon');
      if (checkIcon) checkIcon.textContent = isActive ? '✓' : '';
      if (chartInstance && currentOverviewData?.corporate_events?.events) {
        chartInstance.setEventMarkers(isActive ? currentOverviewData.corporate_events.events : []);
      }
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
    if (fsBtn) fsBtn.classList.add('active');
    triggerChartResize();
  };

  const exitFullscreen = () => {
    if (!chartPanel || !chartPanel.classList.contains('chart-fullscreen-mode')) return;
    chartPanel.classList.remove('chart-fullscreen-mode');
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

  // 6. Left Rail: More options
  const railMore = document.getElementById('tv-rail-more');
  if (railMore) {
    railMore.addEventListener('click', () => {
      showToast(`Apex Financial Terminal · TradingView Lightweight Engine`, 'info');
    });
  }

  // 7. Bottom Status Bar: Scale Mode Toggles
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

// Apex Terminal Lightweight Stackable Toast System
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
    localStorage.setItem('apex_watchlist_drawer_open', 'true');
    refreshWatchlistUI();
  };

  const closeDrawer = () => {
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (tvSidebarToggle) tvSidebarToggle.classList.remove('active');
    localStorage.setItem('apex_watchlist_drawer_open', 'false');
  };

  if (toggleBtn) toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  // TradingView Right Sidebar Toggle Button from chart toolbar
  if (tvSidebarToggle) {
    tvSidebarToggle.addEventListener('click', () => {
      if (drawer && drawer.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
  }

  // Drawer Tabs: Watchlist vs Alerts
  const tabWl = document.getElementById('drawer-tab-watchlist');
  const tabAlerts = document.getElementById('drawer-tab-alerts');
  const viewWl = document.getElementById('tv-drawer-view-watchlist');
  const viewAlerts = document.getElementById('tv-drawer-view-alerts');

  const switchTab = (tab) => {
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

  // Open by default on desktop (>= 1024px) unless explicitly closed by user
  const savedState = localStorage.getItem('apex_watchlist_drawer_open');
  if (savedState === 'true' || (savedState === null && window.innerWidth >= 1024)) {
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

// Refresh and Render Watchlist Items (Strictly Cache-Only Contract)
async function refreshWatchlistUI() {
  const symbols = watchlist.getSymbols();
  const navCount = document.getElementById('watchlist-nav-count');
  const drawerBadge = document.getElementById('watchlist-drawer-badge');
  const listContainer = document.getElementById('watchlist-items-list');

  if (navCount) navCount.textContent = symbols.length;
  if (drawerBadge) drawerBadge.textContent = `${symbols.length} saved`;
  if (!listContainer) return;

  if (symbols.length === 0) {
    listContainer.innerHTML = `
      <div class="watchlist-empty-state">
        <span class="watchlist-empty-text">Nothing here yet. Add a symbol to get started.</span>
      </div>
    `;
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
    renderWatchlistRows(quotes);
  } catch (err) {
    console.warn('Batch watchlist fetch failed, showing basic tickers:', err);
    renderWatchlistRows(symbols.map((sym) => ({ symbol: sym, status: 'pending' })));
  }
}

function renderWatchlistRows(quotes) {
  const listContainer = document.getElementById('watchlist-items-list');
  if (!listContainer) return;

  listContainer.innerHTML = quotes
    .map((item) => {
      const sym = item.symbol;
      const isCurrent = sym === currentSymbol;
      const isPending = item.status === 'pending';
      const isUp = (item.change || 0) >= 0;
      const chgClass = isUp ? 'chg-up' : 'chg-down';
      const chgGlyph = isUp ? '▲ +' : '▼ ';
      const curr = item.currency_symbol || '$';
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
      loadStock(sym, currentTimeframe);
    });
  });

  // Delete button
  listContainer.querySelectorAll('.wl-item-del-btn').forEach((btn) => {
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


// Render Search Dropdown Results
function renderSearchDropdown(items) {
  const searchDropdown = document.getElementById('search-dropdown');
  if (!searchDropdown) return;

  if (items.length === 0) {
    searchDropdown.innerHTML = '<div style="padding: 12px; font-size: 12px; color: #94a3b8;">No matching assets found.</div>';
    searchDropdown.classList.add('open');
    return;
  }

  searchDropdown.innerHTML = items
    .map(
      (item) => `
      <div class="search-item" data-symbol="${item.symbol}">
        <div>
          <div class="search-item-symbol">${item.symbol}</div>
          <div class="search-item-name">${item.name}</div>
        </div>
        <span class="search-item-category">${item.category || item.exchange || 'Asset'}</span>
      </div>
    `
    )
    .join('');

  searchDropdown.classList.add('open');

  // Attach click to each result item
  searchDropdown.querySelectorAll('.search-item').forEach((elem) => {
    elem.addEventListener('click', () => {
      const sym = elem.getAttribute('data-symbol');
      searchDropdown.classList.remove('open');
      const searchInput = document.getElementById('global-search-input');
      if (searchInput) searchInput.value = '';
      loadStock(sym, currentTimeframe);
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
async function loadMarketOverview() {
  try {
    const data = await api.getMarketOverview();
    marketDataCache = data;

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
          const glyph = isUp ? '▲ +' : '▼ ';
          const chgVal = Math.abs(data.hero.change || 0).toFixed(2);
          const chgPct = Math.abs(data.hero.change_pct || 0).toFixed(2);
          heroChange.textContent = `${glyph}${chgVal} (${glyph}${chgPct}%)`;
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
        categoryList.forEach((it) => items.push(it));
      }
    });
  }

  // Duplicate list to create seamless infinite marquee
  const fullTape = [...items, ...items];

  tapeTrack.innerHTML = fullTape
    .map((item) => {
      const isUp = (item.change || 0) >= 0;
      const chgClass = isUp ? 'chg-up' : 'chg-down';
      const chgGlyph = isUp ? '▲ +' : '▼ ';
      return `
        <div class="tape-item" data-symbol="${item.symbol}">
          <span class="tape-sym">${item.name || item.symbol}</span>
          <span class="tape-val">${item.price?.toFixed(2) || '—'}</span>
          <span class="tape-chg ${chgClass}">${chgGlyph}${Math.abs(item.change_pct || 0).toFixed(2)}%</span>
        </div>
      `;
    })
    .join('');

  // Click on tape item to view stock
  tapeTrack.querySelectorAll('.tape-item').forEach((elem) => {
    elem.addEventListener('click', () => {
      const sym = elem.getAttribute('data-symbol');
      loadStock(sym, currentTimeframe);
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
      const chgGlyph = isUp ? '▲ +' : '▼ ';
      const decimals = currentMacroCategory === 'Forex' ? 4 : 2;
      const isStale = Boolean(item.is_stale);
      const isOffline = item.price == null || item.status === 'unavailable';
      const statusDot = isOffline
        ? '<span class="macro-status-dot offline" title="Feed Offline"></span>'
        : (isStale ? '<span class="macro-status-dot stale" title="Stale Cache"></span>' : '');

      return `
        <div class="macro-mini-card ${isStale ? 'stale-card' : ''}" data-symbol="${item.symbol}">
          <div class="macro-mini-sym">
            <div style="display: flex; align-items: center; gap: 4px;">
              ${statusDot}
              <span>${item.symbol}</span>
            </div>
            <span class="tape-chg ${chgClass}">${chgGlyph}${Math.abs(item.change_pct || 0).toFixed(2)}%</span>
          </div>
          <div class="macro-mini-name">${item.name || item.symbol}</div>
          <div class="macro-mini-middle">
            <div class="macro-mini-price">${item.price != null ? item.price.toFixed(decimals) : '—'}</div>
            ${generateSparklineSvg(isUp, item.symbol)}
          </div>
        </div>
      `;
    })
    .join('');

  // Click to view in deep terminal
  container.querySelectorAll('.macro-mini-card').forEach((card) => {
    card.addEventListener('click', () => {
      const sym = card.getAttribute('data-symbol');
      loadStock(sym, currentTimeframe);
    });
  });
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
  const tvLegInterval = document.getElementById('tv-leg-interval');
  if (tvLegInterval) tvLegInterval.textContent = timeframe.toUpperCase();

  if (chartInstance) {
    chartInstance.resetCornerLegend(symbol, timeframe);
  }

  try {
    // 1. Fetch Overview Fundamentals
    const overview = await api.getStockOverview(symbol);
    if (token !== currentLoadToken) return; // Discard stale click response
    currentOverviewData = overview;
    renderStockOverview(overview);

    // 2. Fetch Chart History
    await loadStockChart(symbol, timeframe, token);

    // 3. Fetch Research Core Dossier & Multi-Year Statements
    loadStockResearch(symbol, token);

    // 4. Fetch Deep Research Bundle
    loadStockDeepResearch(symbol, token, overview);

    // 5. Fetch Apex v4 Intelligence (What Changed, Anomalies, Relationships, Statement Quality, Filing Diff)
    loadStockV4Intelligence(symbol, token);

    // 6. Fetch Macro Explorer correlations
    loadAndRenderMacroExplorer(symbol);
  } catch (err) {
    if (token !== currentLoadToken) return;
    console.error(`Failed to load asset ${symbol}:`, err);
  }
}

// Load Only Chart Data with Race Condition Token and Skeleton Shimmer
async function loadStockChart(symbol, timeframe = '1y', parentToken = null) {
  const token = parentToken || ++currentLoadToken;
  const shimmer = document.getElementById('chart-skeleton-shimmer');
  if (shimmer) shimmer.classList.add('active');

  const tvLegInterval = document.getElementById('tv-leg-interval');
  if (tvLegInterval) tvLegInterval.textContent = timeframe.toUpperCase();

  if (chartInstance) {
    chartInstance.resetCornerLegend(symbol, timeframe);
  }

  try {
    const historyData = await api.getStockHistory(symbol, timeframe);
    if (token !== currentLoadToken) return; // Discard stale chart response
    currentCandles = historyData.candles || [];
    if (chartInstance) {
      chartInstance.setData(historyData);
      updateChartEventMarkers();
    }
    renderObservations(historyData.observations || []);
  } catch (err) {
    if (token !== currentLoadToken) return;
    console.error(`Failed to load history for ${symbol}:`, err);
  } finally {
    if (token === currentLoadToken && shimmer) {
      shimmer.classList.remove('active');
    }
  }
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
  const currSym = data.currency_symbol || '₹';
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
    const glyph = isUp ? '▲ +' : '▼ ';
    const chgVal = Math.abs(data.change || 0).toFixed(decimals);
    const chgPct = Math.abs(data.change_pct || 0).toFixed(2);
    stockChangePct.textContent = `${glyph}${chgVal} (${glyph}${chgPct}%)`;
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
  if (tvLegInterval) tvLegInterval.textContent = currentTimeframe.toUpperCase();
  if (tvBbStatus) tvBbStatus.textContent = `${data.provenance?.primary_source || 'NSE India'} · Live Session`;
  if (alertFormSymbol) alertFormSymbol.textContent = data.symbol;

  // Render Valuation Grid
  renderValuationGrid(data);
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
        loadStock(sym, currentTimeframe);
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
      const currSym = item.currency_symbol || '$';
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
              Inspect ↗
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
        loadStock(sym, currentTimeframe);
        window.scrollTo({ top: document.querySelector('.terminal-card')?.offsetTop - 80 || 280, behavior: 'smooth' });
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

// Fetch and Render Apex v4 Intelligence
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
    console.warn(`Apex v4 intelligence notice for ${symbol}:`, err);
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

// Global Market Map & Sector Intelligence (Tab 8)
async function loadAndRenderSectorsAndMarketMap() {
  const mapGrid = document.getElementById('global-market-map-grid');
  const secGrid = document.getElementById('sector-intelligence-grid');

  if (mapGrid) {
    const markets = [
      { name: 'India (NIFTY 50)', symbol: '^NSEI', region: 'India Benchmark', change: '+0.84%', isUp: true },
      { name: 'India (SENSEX)', symbol: '^BSESN', region: 'BSE Index', change: '+0.76%', isUp: true },
      { name: 'US (S&P 500)', symbol: '^GSPC', region: 'US Broad Market', change: '+0.42%', isUp: true },
      { name: 'US (Nasdaq 100)', symbol: '^NDX', region: 'US Technology', change: '+0.65%', isUp: true },
      { name: 'Europe (FTSE 100)', symbol: '^FTSE', region: 'United Kingdom', change: '-0.18%', isUp: false },
      { name: 'Japan (Nikkei 225)', symbol: '^N225', region: 'Asia Pacific', change: '+0.73%', isUp: true },
    ];

    mapGrid.innerHTML = markets
      .map(
        (m) => `
        <div class="market-map-tile" style="cursor: pointer;" onclick="window.apexLoad('${m.symbol}')">
          <div>
            <div style="font-size: 11px; color: var(--text-muted);">${m.region}</div>
            <div style="font-size: 14px; font-weight: 700; color: #ffffff; margin: 4px 0;">${m.name}</div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--accent-cyan);">${m.symbol}</span>
            <span class="tape-chg ${m.isUp ? 'chg-up' : 'chg-down'}">${m.change}</span>
          </div>
        </div>
      `
      )
      .join('');
  }

  if (secGrid) {
    try {
      const data = await api.getSectorIntelligence();
      secGrid.innerHTML = (data.sectors || [])
        .map((s) => {
          const isUp = s.performance_24h_pct >= 0;
          return `
          <div class="sector-card" style="cursor: pointer;" onclick="window.apexLoad('${s.leading_asset}')">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 13px; font-weight: 700; color: #ffffff;">${s.display_name}</span>
              <span class="tape-chg ${isUp ? 'chg-up' : 'chg-down'}">${isUp ? '+' : ''}${s.performance_24h_pct}%</span>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
              Leader: <strong style="color: var(--accent-cyan);">${s.leading_asset}</strong>
            </div>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              ${s.constituents.slice(0, 4).map((c) => `<span class="meta-badge" style="font-size: 10px;">${c}</span>`).join('')}
            </div>
          </div>
        `;
        })
        .join('');
    } catch (e) {
      console.warn('Failed sector intelligence load:', e);
    }
  }
}
window.apexLoad = (sym) => loadStock(sym, currentTimeframe);

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
  const drawer = document.getElementById('alerts-drawer');
  const backdrop = document.getElementById('alerts-backdrop');
  const toggleBtn = document.getElementById('alerts-modal-toggle');
  const closeBtn = document.getElementById('close-alerts-drawer-btn');
  const createBtn = document.getElementById('create-alert-btn');

  const open = () => {
    if (drawer) drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    refreshAlertsUI();
  };

  const close = () => {
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  };

  if (toggleBtn) toggleBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);

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
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 24px;">No alerts configured. Create one above to track price or indicator thresholds.</div>';
    return;
  }

  container.innerHTML = allAlerts
    .map(
      (a) => `
      <div style="background: var(--surface); border: 1px solid ${a.triggered ? 'var(--loss)' : 'var(--border)'}; border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; color: var(--text); font-size: 13px;">
            ${a.symbol} | <span>${a.metric}</span> ${a.operator} ${a.target}
          </div>
          <div style="font-size: 11px; color: ${a.triggered ? 'var(--loss)' : 'var(--text-dim)'}; margin-top: 2px;">
            ${a.triggered ? `Triggered at ${new Date(a.triggeredAt).toLocaleTimeString()}` : `Active. Created ${new Date(a.createdAt).toLocaleDateString()}`}
          </div>
        </div>
        <button onclick="window.apexDeleteAlert('${a.id}')" style="background: transparent; border: none; color: var(--text-dim); cursor: pointer; font-size: 14px;">✕</button>
      </div>
    `
    )
    .join('');
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

