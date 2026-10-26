/**
 * Resilient API Client with Cold-Start Detection & Auto-Retry
 * Handles Render free-tier wake-up latency (30-50s) gracefully by providing
 * status updates to the UI.
 */
import { auth, getAuthToken } from './auth.js';

// Base URL configured for production (e.g. Vercel/Netlify pointing to Render/Cloud Run)
// Falls back to empty string in development to use Vite's dev proxy.
const RAW_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
const API_BASE = RAW_BASE ? RAW_BASE.replace(/\/+$/, '') : '';

// Determine WebSocket protocol based on page protocol (wss for HTTPS, ws for HTTP)
const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
const WS_PROTOCOL = isSecure ? 'wss:' : 'ws:';

const WS_BASE = RAW_BASE
  ? RAW_BASE.replace(/^http/, WS_PROTOCOL.replace(':', '')).replace(/\/+$/, '')
  : (typeof window !== 'undefined' ? `${WS_PROTOCOL}//${window.location.host}` : '');

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
    let coldStartTimer = null;

    try {
      coldStartTimer = setTimeout(() => {
        this.setStatus({
          isWaking: true,
          message: 'Waking terminal cloud server from sleep... Please allow 20–30s on free hosting.',
        });
      }, 2500);

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        signal: controller.signal,
      });

      clearTimeout(id);
      clearTimeout(coldStartTimer);
      this.setStatus({ isWaking: false, message: '' });

      if (!response.ok) {
        if (response.status === 401 && !url.startsWith('/api/auth/')) {
          await auth.expireToken();
          const expired = new Error('Your Mara session has expired. Please sign in again.');
          expired.authExpired = true;
          throw expired;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(coldStartTimer);
      if (error?.authExpired) throw error;
      if (retries > 0) {
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

  async getStockOverview(symbol) {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(`/api/stocks/${encodeURIComponent(sym)}/overview`);
  }

  async getBatchStockOverview(symbols) {
    if (!symbols || symbols.length === 0) return [];
    return this.fetchWithRetry('/api/stocks/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ symbols: symbols.slice(0, 50) }),
    });
  }

  async getStockHistory(symbol, timeframe = 'max', interval = '1d') {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(
      `/api/stocks/${encodeURIComponent(sym)}/history?timeframe=${timeframe}&interval=${interval}`
    );
  }

  async getMarketCandles(symbol, interval = '1m', range = '1d') {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(
      `/api/market/candles?symbol=${encodeURIComponent(sym)}&interval=${interval}&range=${range}`
    );
  }

  async getStockResearch(symbol) {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(`/api/stocks/${encodeURIComponent(sym)}/research`);
  }

  async searchAssets(query) {
    return this.fetchWithRetry(`/api/search?q=${encodeURIComponent(query)}`);
  }

  async getScreener(universe = 'us_mega_caps') {
    return this.fetchWithRetry(`/api/screener?universe=${encodeURIComponent(universe)}`);
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
}

export const api = new ApiClient();

// ===== Market WebSocket Client =====
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
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return Promise.resolve();

    this.isConnecting = true;
    const wsUrl = `${WS_BASE}/ws/markets`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[MarketWS] Connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this._setStatus('connected');
          this._send({ action: 'subscribe', symbols: Array.from(this.subscriptions) });
          resolve();
        };

        this.ws.onclose = (event) => {
          console.log('[MarketWS] Disconnected:', event.code, event.reason);
          this.isConnecting = false;
          this._clearHeartbeat();
          this._setStatus('disconnected');
          this._scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[MarketWS] Error:', error);
          this._setStatus('error');
          if (this.isConnecting) {
            this.isConnecting = false;
            reject(error);
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
        reject(e);
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
    setTimeout(() => this.connect(), delay);
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

  onPriceUpdate(symbol, callback) {
    if (!this.handlers.has(symbol)) {
      this.handlers.set(symbol, new Set());
    }
    this.handlers.get(symbol).add(callback);
    return () => this.handlers.get(symbol)?.delete(callback);
  }

  disconnect() {
    this._clearHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.subscriptions.clear();
    this.handlers.clear();
  }
}

export const marketWS = new MarketWebSocket();
