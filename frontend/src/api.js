/**
 * Resilient API Client with Cold-Start Detection & Auto-Retry
 * Handles Render free-tier wake-up latency (30-50s) gracefully by providing
 * status updates to the UI.
 */

// Base URL configured for production (e.g. Vercel/Netlify pointing to Render/Cloud Run)
// Falls back to empty string in development to use Vite's dev proxy.
const RAW_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
const API_BASE = RAW_BASE ? RAW_BASE.replace(/\/+$/, '') : '';

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
        signal: controller.signal,
      });

      clearTimeout(id);
      clearTimeout(coldStartTimer);
      this.setStatus({ isWaking: false, message: '' });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(coldStartTimer);
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

  async getStockHistory(symbol, timeframe = '1y', interval = '1d') {
    const sym = (symbol || '').trim().replace(/\//g, '');
    return this.fetchWithRetry(
      `/api/stocks/${encodeURIComponent(sym)}/history?timeframe=${timeframe}&interval=${interval}`
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

  async triggerCacheRefresh(secret = 'apex_internal_secret_change_in_prod') {
    return this.fetchWithRetry('/internal/refresh-cache', {
      method: 'POST',
      headers: {
        'X-Internal-Secret': secret,
        'Content-Type': 'application/json',
      },
    });
  }
}

export const api = new ApiClient();

