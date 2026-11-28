/**
 * Resilient API Client with Cold-Start Detection & Auto-Retry
 * Handles Render free-tier wake-up latency (30-50s) gracefully by providing
 * status updates to the UI.
 */
import { auth, getAuthToken } from './auth.js';
import { internationalEquities, internationalEquityAliases, equitySearchKey } from './equity-directory.js';
import { makeGlobalDemoAsset, globalDemoInterval } from './demo/global-history.js';

// Base URL configured for production (e.g. Vercel/Netlify pointing to Render/Cloud Run)
// Falls back to empty string in development to use Vite's dev proxy.
const RAW_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
const API_BASE = RAW_BASE ? RAW_BASE.replace(/\/+$/, '') : '';

// Determine WebSocket protocol based on page protocol (wss for HTTPS, ws for HTTP)
const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
const WS_PROTOCOL = isSecure ? 'wss:' : 'ws:';

const WS_BASE = API_BASE
  ? API_BASE.replace(/^http(?=s?:)/, 'ws')
  : (typeof window !== 'undefined' ? `${WS_PROTOCOL}//${window.location.host}` : '');

// Demo mode: serve synthetic data from static JSON files, no live API calls.
// Supports build-time flag (VITE_DEMO_MODE) and dynamic client-side activation.
export const isShowcaseBuild = import.meta.env.VITE_DEMO_MODE === 'true';

export function isDemoMode() {
  if (typeof window === 'undefined') return false;
  return (
    isShowcaseBuild ||
    window.__DEMO_MODE__ === true ||
    window.localStorage?.getItem('mara_demo_mode') === 'true'
  );
}

/** @param {boolean} enable */
export function setDemoMode(enable) {
  if (typeof window === 'undefined') return;
  if (enable) {
    try { window.localStorage?.setItem('mara_demo_mode', 'true'); } catch (e) { /* ignore */ }
    window.__DEMO_MODE__ = true;
  } else {
    try { window.localStorage?.removeItem('mara_demo_mode'); } catch (e) { /* ignore */ }
    window.__DEMO_MODE__ = false;
  }
}

const DEMO_BASE = '/demo';

const DEMO_ROUTES = {
  '/api/markets/overview': `${DEMO_BASE}/market-overview.json`,
  '/api/analytics/sectors': `${DEMO_BASE}/sectors.json`,
  '/api/analytics/correlation': `${DEMO_BASE}/correlation.json`,
};

const DEMO_UNIVERSES = {
  us_mega_caps: 'US Mega-Caps',
  indian_leaders: 'Indian Leaders',
  semiconductors_ai: 'Semiconductors & AI',
  crypto: 'Crypto',
  commodities: 'Commodities',
  forex: 'Forex',
};
const DEMO_STOCKS = new Set([
  'TCS.NS', 'RELIANCE.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS',
  'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA',
]);
const demoGlobalAssets = new Map();

export function hasDemoEquityHistory(symbol) {
  return DEMO_STOCKS.has(symbol) || internationalEquities.has(symbol);
}

function getGlobalDemoAsset(symbol) {
  const listing = internationalEquities.get(symbol);
  if (!listing) return undefined;
  if (!demoGlobalAssets.has(symbol)) demoGlobalAssets.set(symbol, makeGlobalDemoAsset(listing));
  return demoGlobalAssets.get(symbol);
}

/** @param {string} range */
function normalizeChartRange(range) {
  const value = range.toLowerCase();
  return { '1m': '1mo', '3m': '3mo', '6m': '6mo', all: 'max' }[value] || value;
}

/** @param {string} symbol @param {string} suffix */
function demoStockFile(symbol, suffix) {
  const safe = symbol.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
  // Strip query params from suffix (e.g. "history?timeframe=1d" -> "history")
  const cleanSuffix = suffix.split('?')[0];
  return `${DEMO_BASE}/${cleanSuffix}-${safe}.json`;
}

/** @param {string} path */
async function readFixture(path, signal) {
  const response = await fetch(path, { signal });
  return response.ok ? response.json() : null;
}

/** @param {string} symbol @param {string} interval */
async function demoChartHistory(symbol, interval, signal) {
  const unavailable = { symbol, interval, candles: [], demo_mode: true, freshness: 'unavailable' };
  const daily = ['1d', '1wk', '1mo'].includes(interval);
  if (!DEMO_STOCKS.has(symbol)) {
    const globalAsset = getGlobalDemoAsset(symbol);
    if (globalAsset) {
      if (!daily) return { ...unavailable, message: 'Intraday history is unavailable in demo mode. Choose 1D, 1W, or 1M.' };
      return {
        ...globalAsset.source, interval, candles: globalDemoInterval(globalAsset.candles, interval),
        latest_quote: globalAsset.quote,
      };
    }
    const histories = await readFixture(`${DEMO_BASE}/benchmark-candles.json`, signal);
    const candles = histories && Object.hasOwn(histories, symbol) ? histories[symbol] : null;
    if (!candles) return { ...unavailable, message: 'No synthetic price history is available for this symbol.' };
    if (!daily) return { ...unavailable, message: 'Intraday history is unavailable in demo mode. Choose 1D, 1W, or 1M.' };
    const snapshot = await readFixture(DEMO_ROUTES['/api/markets/overview'], signal);
    return {
      ...unavailable, candles, freshness: 'synthetic', data_source: 'Synthetic demo',
      last_updated: snapshot?.timestamp, latest_quote: demoSnapshotQuote(symbol, snapshot),
    };
  }
  if (!daily) {
    return { ...unavailable, message: 'Intraday history is unavailable in demo mode. Choose 1D, 1W, or 1M.' };
  }
  const fixture = await readFixture(demoStockFile(symbol, 'candles'), signal);
  const last = fixture?.candles?.at(-1);
  if (!last) return { ...unavailable, message: 'No synthetic price history is available for this symbol.' };
  return {
    ...fixture,
    interval,
    freshness: 'synthetic',
    data_source: 'Synthetic demo',
    last_updated: new Date(last.time * 1000).toISOString(),
    latest_quote: (await getDemoCatalog()).get(symbol),
  };
}

function demoOverview(quote) {
  return quote && {
    ...quote,
    current_price: quote.price,
    pe_trailing: quote.pe_ratio,
    high_52w: quote.week_52_high,
    low_52w: quote.week_52_low,
    data_source: 'Synthetic demo',
  };
}

let demoCatalog;
async function loadDemoCatalog() {
  const entries = await Promise.all([...DEMO_STOCKS].map(async (symbol) => {
    const quote = demoOverview(await readFixture(demoStockFile(symbol, 'overview')));
    return /** @type {const} */ ([symbol, quote]);
  }));
  return new Map(entries.filter(([, quote]) => quote));
}

function getDemoCatalog() {
  demoCatalog ||= loadDemoCatalog().catch((error) => {
    demoCatalog = undefined;
    throw error;
  });
  return demoCatalog;
}

function demoSnapshotQuote(symbol, snapshot) {
  const quote = [...(snapshot?.indices || []), ...(snapshot?.forex || []), ...(snapshot?.commodities || [])]
    .find((item) => item.symbol === symbol);
  return {
    ...quote,
    symbol,
    name: quote?.name || symbol,
    current_price: quote?.price ?? null,
    data_source: 'Synthetic demo',
    last_updated: snapshot?.timestamp,
    demo_snapshot_only: true,
  };
}

async function demoFetch(url, options) {
  // Demo mode must never reach the live network — reject absolute URLs
  if (/^https?:\/\//i.test(url)) return null;

  // Strip query params for route lookup (e.g. /api/screener?universe=indian_leaders)
  const [pathOnly, query] = url.split('?');
  const params = new URLSearchParams(query);
  if (pathOnly === '/api/markets/overview') {
    const snapshot = await readFixture(DEMO_ROUTES[pathOnly]);
    if (!snapshot) return null;
    const { indices, forex, commodities, timestamp } = snapshot;
    return {
      ...snapshot,
      macro: {
        Indices: indices.filter(({ symbol }) => symbol.startsWith('^')),
        Forex: forex,
        Commodities: commodities,
        Crypto: indices.filter(({ symbol }) => symbol.endsWith('-USD')),
      },
      retrieved_at: timestamp,
      source: 'Synthetic demo',
    };
  }
  if (pathOnly === '/api/stocks/batch') {
    const symbols = JSON.parse(options.body);
    const catalog = await getDemoCatalog();
    const snapshot = symbols.some((symbol) => !catalog.has(symbol))
      ? await readFixture(DEMO_ROUTES['/api/markets/overview'])
      : null;
    return symbols.map((symbol) => {
      const quote = catalog.get(symbol) || getGlobalDemoAsset(symbol)?.quote || demoSnapshotQuote(symbol, snapshot);
      return { ...quote, status: quote.current_price == null ? 'unavailable' : 'cached' };
    });
  }
  if (pathOnly === '/api/analytics/sectors') {
    const fixture = await readFixture(DEMO_ROUTES[pathOnly]);
    if (!fixture) return null;
    const catalog = await getDemoCatalog();
    const sectors = fixture.sectors.map(({ name, change_pct, top_symbols }) => {
      const constituent_performance = top_symbols
        .map((symbol) => ({ symbol, change_pct: catalog.get(symbol)?.change_pct }))
        .filter((quote) => Number.isFinite(quote.change_pct));
      const advancing = constituent_performance.filter((quote) => quote.change_pct > 0).length;
      const declining = constituent_performance.filter((quote) => quote.change_pct < 0).length;
      return {
        sector: name,
        display_name: name,
        performance_24h_pct: change_pct,
        constituents: top_symbols,
        leading_asset: top_symbols[0] ?? null,
        constituent_performance,
        advancing,
        declining,
        unchanged: constituent_performance.length - advancing - declining,
      };
    });
    return { ...fixture, sectors };
  }
  if (pathOnly === '/api/search') {
    const term = equitySearchKey(params.get('q') || '');
    const catalog = await getDemoCatalog();
    const listings = [...catalog.values(), ...internationalEquities.values()];
    const rank = item => {
      const symbol = equitySearchKey(item.symbol);
      const name = equitySearchKey(item.name || '');
      const aliases = Object.hasOwn(internationalEquityAliases, item.symbol) ? internationalEquityAliases[item.symbol] : [];
      if (symbol === term) return 0;
      if (symbol.split('.')[0] === term || name === term || aliases.some(alias => equitySearchKey(alias) === term)) return 1;
      if (symbol.startsWith(term) || name.startsWith(term)) return 2;
      return symbol.includes(term) || name.includes(term) || aliases.some(alias => equitySearchKey(alias).includes(term))
        ? 3 : Infinity;
    };
    return { results: listings.filter(item => Number.isFinite(rank(item)))
      .sort((left, right) => rank(left) - rank(right)).slice(0, 20) };
  }
  if (pathOnly === '/api/analytics/correlation') {
    const fixture = await readFixture(DEMO_ROUTES[pathOnly]);
    if (!fixture) return null;
    const { symbols, matrix } = fixture;
    return { ...fixture, matrix: symbols.map(left => symbols.map(right => matrix[left]?.[right] ?? null)) };
  }
  if (pathOnly === '/api/screener') {
    const universe = params.get('universe') || 'us_mega_caps';
    const title = DEMO_UNIVERSES[universe];
    if (['forex', 'commodities'].includes(universe)) {
      const snapshot = await readFixture(DEMO_ROUTES['/api/markets/overview'], options?.signal);
      if (!snapshot) return null;
      const items = (snapshot[universe] || []).map(quote => ({ ...quote, demo_snapshot_only: true }));
      return { universe_key: universe, title, items, count: items.length };
    }
    const fixture = await readFixture(`${DEMO_BASE}/screener.json`, options?.signal);
    if (!fixture) return null;
    const symbols = new Set(fixture.universes[title] || []);
    if (universe === 'crypto') {
      const snapshot = await readFixture(DEMO_ROUTES['/api/markets/overview'], options?.signal);
      if (!snapshot) return null;
      const items = (snapshot.indices || []).filter(quote => symbols.has(quote.symbol));
      return { universe_key: universe, title, items, count: items.length };
    }
    const catalog = await getDemoCatalog();
    const items = [...catalog.values()].filter(({ symbol }) => symbols.has(symbol));
    return { universe_key: universe, title: title || 'Demo coverage unavailable', items, count: items.length };
  }
  if (pathOnly === '/api/rss/news') return { items: [], source: 'Demo' };
  if (pathOnly === '/api/markets/candles') {
    return demoChartHistory(params.get('symbol'), params.get('interval') || '1m', options?.signal);
  }
  let demoUrl;
  if (DEMO_ROUTES[pathOnly]) {
    demoUrl = DEMO_ROUTES[pathOnly];
  } else if (url.startsWith('/api/stocks/')) {
    const parts = pathOnly.split('/');
    const symbol = decodeURIComponent(parts[3] || '');
    const suffix = parts[4] || 'overview';
    if (suffix === 'history') return demoChartHistory(symbol, params.get('interval') || '1d', options?.signal);
    if (suffix === 'overview' && !DEMO_STOCKS.has(symbol)) {
      const globalAsset = getGlobalDemoAsset(symbol);
      if (globalAsset) return globalAsset.quote;
      const snapshot = await readFixture(DEMO_ROUTES['/api/markets/overview']);
      return demoSnapshotQuote(symbol, snapshot);
    }
    if (!DEMO_STOCKS.has(symbol)) {
      return null;
    }
    demoUrl = demoStockFile(symbol, suffix);
    if (suffix === 'overview') return (await getDemoCatalog()).get(symbol) || null;
    if (suffix === 'research') {
      const fixture = await readFixture(demoUrl);
      if (!fixture) return null;
      const quote = (await getDemoCatalog()).get(symbol);
      return {
        ...fixture,
        currency_symbol: quote?.currency_symbol,
        provenance: { primary_source: 'MARA synthetic research fixture', cache_status: 'Sample' },
        price_structure: { current_price: quote?.price },
        peer_intelligence: {
          peers: (fixture.peers || []).map(peer => ({ ...peer, pe_trailing: peer.pe })),
        },
        research_dossier: { valuation_peer_context: { current_pe: fixture.valuation?.pe_current } },
      };
    }
    if (suffix === 'deep-research') {
      const fixture = await readFixture(demoUrl);
      if (!fixture) return null;
      const envelope = fixture.valuation_envelope;
      return {
        ...fixture,
        quarterly_earnings: (fixture.quarterly_trends || []).map(quarter => ({
          period_date: quarter.quarter,
          revenue_str: quarter.revenue?.toLocaleString() ?? '—',
          operating_income_str: '—',
          net_income_str: quarter.net_income?.toLocaleString() ?? '—',
          net_margin_pct: Number.isFinite(quarter.net_income) && quarter.revenue > 0
            ? Math.round(10000 * quarter.net_income / quarter.revenue) / 100 : null,
        })),
        corporate_events: {
          events: (fixture.corporate_actions || []).map(action => ({
            date: action.date,
            type: action.type === 'dividend' ? 'Dividend' : action.type,
            title: action.description,
            impact: '—',
          })),
        },
        historical_valuation: envelope ? {
          current_pe: envelope.pe_current,
          pe_5y_low: envelope.pe_5y_min,
          pe_5y_high: envelope.pe_5y_max,
          sample: true,
        } : null,
      };
    }
  } else {
    return null;
  }
  return readFixture(demoUrl);
}

class ApiClient {
  constructor() {
    this.onStatusChange = null;
  }

  setStatus(status) {
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(status);
    }
  }

  async fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 45000) {
    options.signal?.throwIfAborted();
    // Demo mode: serve synthetic data from static JSON files, no live API calls.
    // Fail closed — never fall through to a live network request in demo mode.
    if (isDemoMode()) {
      const data = await demoFetch(url, options);
      options.signal?.throwIfAborted();
      if (data !== null) return data;
      throw new Error(`[DEMO] No synthetic fixture for ${url}`);
    }

    let coldStartTimer = null;

    try {
      coldStartTimer = setTimeout(() => {
        this.setStatus({
          isWaking: true,
          message: 'Waking terminal cloud server from sleep... Please allow 20–30s on free hosting.',
        });
      }, 2500);

      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken() }` } : {}),
        },
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      });

      clearTimeout(coldStartTimer);
      this.setStatus({ isWaking: false, message: '' });

      if (!response.ok) {
        if (response.status === 401 && !url.startsWith('/api/auth/')) {
          await auth.expireToken();
          throw Object.assign(new Error('Your MARA session has expired. Please sign in again.'), { authExpired: true });
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(coldStartTimer);
      if (options.signal?.aborted) {
        this.setStatus({ isWaking: false, message: '' });
        throw error;
      }
      if (error?.authExpired) throw error;

      // Extract status code from error message (e.g., "HTTP 422: Unprocessable Entity")
      const statusMatch = error.message?.match(/HTTP (\d+):/);
      const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;

      // Don't retry on client errors (4xx) except 429 (rate limit)
      const isClientError = statusCode >= 400 && statusCode < 500 && statusCode !== 429;

      if (retries > 0 && !isClientError) {
        console.warn(`Request failed for ${url}, retrying... (${retries} left). Error: ${error.message}`);
        this.setStatus({
          isWaking: true,
          message: 'Retrying connection with financial cloud node...',
        });
        await new Promise((r) => setTimeout(r, 2000));
        return this.fetchWithRetry(url, options, retries - 1, timeoutMs);
      }
      this.setStatus({ isWaking: false, message: '' });
      throw error;
    }
  }

  async getMarketOverview() {
    return this.fetchWithRetry('/api/markets/overview');
  }

  async refreshMarketOverview() {
    return this.fetchWithRetry('/api/markets/refresh', { method: 'POST' }, 0, 15000);
  }

  async getStockOverview(symbol, signal) {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(`/api/stocks/${encodeURIComponent(sym)}/overview`, { signal });
  }

  async getBatchStockOverview(symbols, signal) {
    if (!symbols || symbols.length === 0) return [];
    return this.fetchWithRetry('/api/stocks/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(symbols.slice(0, 50)),
      signal,
    });
  }

  async getStockHistory(symbol, timeframe = 'max', interval = '1d', signal) {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(
      `/api/stocks/${encodeURIComponent(sym)}/history?timeframe=${normalizeChartRange(timeframe)}&interval=${interval}`,
      { signal }
    );
  }

  async getMarketCandles(symbol, interval = '1m', range = '1d', signal) {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(
      `/api/markets/candles?symbol=${encodeURIComponent(sym)}&interval=${interval}&range=${normalizeChartRange(range)}`,
      { signal }
    );
  }

  async getAttributedNews(symbol, signal) {
    if (isDemoMode()) return { news_status: 'archive', news_events: [] };
    return this.fetchWithRetry(`/api/research/news?symbol=${encodeURIComponent(symbol)}`, { signal }, 0, 12000);
  }

  async getStockResearch(symbol) {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(`/api/stocks/${encodeURIComponent(sym)}/research`);
  }

  async searchAssets(query, signal) {
    return this.fetchWithRetry(`/api/search?q=${encodeURIComponent(query)}`, { signal }, 0, 8000);
  }

  async getScreener(universe = 'us_mega_caps', signal) {
    return this.fetchWithRetry(`/api/screener?universe=${encodeURIComponent(universe)}`, { signal });
  }

  async getDeepResearch(symbol) {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(`/api/stocks/${encodeURIComponent(sym)}/deep-research`);
  }

  async getCorrelationMatrix(symbols = ['TCS.NS', 'INFY.NS', '^NSEI', 'GC=F', 'BTC-USD'], period = '1y') {
    return this.fetchWithRetry('/api/analytics/correlation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ symbols, period }),
    });
  }

  async getPortfolioRisk(positions, period = '1y') {
    return this.fetchWithRetry('/api/analytics/portfolio-risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions, period }),
    });
  }

  async getSectorIntelligence() {
    return this.fetchWithRetry('/api/analytics/sectors');
  }

  async getV4Intelligence(symbol) {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(`/api/stocks/${encodeURIComponent(sym)}/v4-intelligence`);
  }

  async getMacroExplorer(symbol) {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(`/api/stocks/${encodeURIComponent(sym)}/macro-explorer`);
  }

  async parseResearchQuery(query, activeSymbol) {
    return this.fetchWithRetry('/api/research/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, active_symbol: activeSymbol }),
    });
  }

  // RSS News Fallback Endpoint
  async getRssNews(symbol, feed = 'yahoo') {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(`/api/rss/news?symbol=${encodeURIComponent(sym)}&feed=${encodeURIComponent(feed)}`);
  }
}

export const api = new ApiClient();

// ===== Market WebSocket Client (with polling fallback for Vercel) =====
export class MarketWebSocket {
  constructor() {
    this.ws = null;
    this.subscriptions = new Set();
    this.handlers = new Map(); // symbol -> Set of callbacks
    this.onStatusChange = null;
    this.onPriceUpdate = null;
    this.onMarketStatus = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.heartbeatInterval = null;
    this.isConnecting = false;
    this.reconnectTimer = null;
    this.cancelConnection = null;
    this.pollingRequest = null;

    // Polling fallback for platforms without WebSocket support (e.g., Vercel)
    this.pollingInterval = null;
    this.pollingEnabled = false;
    this.pollingIntervalMs = 15000; // 15 seconds
    this.usePollingFallback = false;
  }

  // Check if we're likely on a platform that doesn't support WebSockets (e.g., Vercel)
  _isWebSocketUnsupportedPlatform() {
    // Check for Vercel deployment indicators
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    return hostname.includes('vercel.app') || hostname.includes('vercel.com');
  }

  connect() {
    if (isDemoMode()) {
      console.log('[MarketWS] Demo mode active - live WebSocket disabled');
      return Promise.resolve();
    }
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return Promise.resolve();

    // If we're on a known unsupported platform, skip WebSocket and use polling immediately
    if (this._isWebSocketUnsupportedPlatform()) {
      console.log('[MarketWS] Vercel detected - using polling fallback');
      this._startPollingFallback();
      return Promise.resolve();
    }

    this.isConnecting = true;
    const wsUrl = `${WS_BASE}/ws/markets`;

    return new Promise((resolve) => {
      let connectionTimeout;
      try {
        this.ws = new WebSocket(wsUrl);
        this.cancelConnection = () => {
          clearTimeout(connectionTimeout);
          resolve();
        };

        // Connection timeout - if WebSocket doesn't connect in 5s, fall back to polling
        connectionTimeout = setTimeout(() => {
          if (this.isConnecting && this.ws?.readyState !== WebSocket.OPEN) {
            console.warn('[MarketWS] Connection timeout - falling back to polling');
            this.ws.close();
            this.isConnecting = false;
            this._startPollingFallback();
            resolve(); // Resolve with polling fallback
          }
        }, 5000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('[MarketWS] Connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this._setStatus('connected');
          this._send({ action: 'subscribe', symbols: Array.from(this.subscriptions) });
          this._stopPollingFallback();
          resolve();
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          resolve();
          console.log('[MarketWS] Disconnected:', event.code, event.reason);
          this.isConnecting = false;
          this._clearHeartbeat();
          this._setStatus('disconnected');

          // If we haven't enabled polling fallback yet, try it
          if (!this.usePollingFallback && event.code !== 1000) {
            this._startPollingFallback();
          } else if (!this.usePollingFallback) {
            this._scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('[MarketWS] Error:', error);
          this._setStatus('error');
          if (this.isConnecting) {
            this.isConnecting = false;
            clearTimeout(connectionTimeout);
            this._startPollingFallback();
            resolve(); // Resolve with polling fallback
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this._handleMessage(msg);
          } catch (e) {
            console.warn('[MarketWS] Invalid message:', event.data);
          }
        };
      } catch (e) {
        this.isConnecting = false;
        clearTimeout(connectionTimeout);
        this._startPollingFallback();
        resolve(); // Resolve with polling fallback
      }
    });
  }

  _setStatus(status) {
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(status);
    }
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[MarketWS] Max reconnect attempts reached');
      return;
    }
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000;
    this.reconnectAttempts++;
    console.log(`[MarketWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  _clearHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  _send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe(symbols) {
    const newSymbols = Array.from(symbols).filter(s => !this.subscriptions.has(s));
    if (newSymbols.length === 0) return;

    newSymbols.forEach(s => this.subscriptions.add(s));
    this._send({ action: 'subscribe', symbols: newSymbols });
  }

  unsubscribe(symbols) {
    const toRemove = Array.from(symbols).filter(s => this.subscriptions.has(s));
    if (toRemove.length === 0) return;

    toRemove.forEach(s => this.subscriptions.delete(s));
    this._send({ action: 'unsubscribe', symbols: toRemove });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'price_update':
        if (this.onPriceUpdate) {
          this.onPriceUpdate(msg.symbol, msg.data, msg.timestamp);
        }
        // Also call symbol-specific handlers
        const handlers = this.handlers.get(msg.symbol);
        if (handlers) {
          handlers.forEach(cb => cb(msg.data, msg.timestamp));
        }
        break;
      case 'market_status':
        if (this.onMarketStatus) {
          this.onMarketStatus(msg.status, msg.message, msg.timestamp);
        }
        break;
      case 'heartbeat':
      case 'pong':
        // Connection alive
        break;
    }
  }

  // ===== Polling Fallback for Vercel and other platforms without WebSocket support =====
  _startPollingFallback() {
    if (this.usePollingFallback) return;

    console.log('[MarketWS] Starting polling fallback');
    this.usePollingFallback = true;
    const controller = new AbortController();
    this.pollingRequest = controller;
    this._setStatus('polling');

    const poll = async () => {
      if (!this.usePollingFallback || this.subscriptions.size === 0) return;

      try {
        // Fetch batch overview for all subscribed symbols
        const symbols = Array.from(this.subscriptions);
        const response = await fetch(`${API_BASE}/api/stocks/batch`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
          },
          body: JSON.stringify(symbols.slice(0, 50)),
        });

        if (response.ok) {
          const data = await response.json();
          if (controller.signal.aborted) return;
          if (data.results) {
            data.results.forEach(item => {
              if (item.status === 'cached' && item.current_price != null) {
                const mockEvent = {
                  type: 'price_update',
                  symbol: item.symbol,
                  data: item,
                  timestamp: new Date().toISOString() + 'Z'
                };
                this._handleMessage(mockEvent);
              }
            });
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) console.warn('[MarketWS] Polling error:', e);
      }

      // Schedule next poll
      if (!controller.signal.aborted) {
        this.pollingInterval = setTimeout(poll, this.pollingIntervalMs);
      }
    };

    // Start polling immediately
    poll();
  }

  _stopPollingFallback() {
    if (!this.usePollingFallback) return;

    console.log('[MarketWS] Stopping polling fallback');
    this.usePollingFallback = false;
    this.pollingRequest?.abort();
    this.pollingRequest = null;

    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  subscribePriceUpdates(symbol, callback) {
    if (!this.handlers.has(symbol)) {
      this.handlers.set(symbol, new Set());
    }
    this.handlers.get(symbol).add(callback);
    return () => this.handlers.get(symbol)?.delete(callback);
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.cancelConnection?.();
    this.cancelConnection = null;
    this.isConnecting = false;
    this._clearHeartbeat();
    this._stopPollingFallback();
    if (this.ws) {
      this.ws.onopen = this.ws.onclose = this.ws.onerror = this.ws.onmessage = null;
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.subscriptions.clear();
    this.handlers.clear();
  }
}

export const marketWS = new MarketWebSocket();
