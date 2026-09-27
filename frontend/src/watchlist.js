/**
 * Watchlist Management Engine
 * - Zero-account persistence in localStorage (per-browser, per-device scope).
 * - Multi-tab synchronization via Window 'storage' event listener.
 * - Strict import validation (regex check, max 50 symbols).
 * - Export to JSON backup.
 */

const STORAGE_KEY = 'apex_user_watchlist';
const DEFAULT_WATCHLIST = ['TCS.NS', 'RELIANCE.NS', 'NVDA', 'BTC-USD', 'EURUSD=X'];
const TICKER_REGEX = /^[A-Za-z0-9\.\^\=\-_]{1,20}$/;
const MAX_WATCHLIST_ITEMS = 50;

export class WatchlistManager {
  constructor() {
    this.subscribers = [];
    this.initStorageListener();
  }

  getSymbols() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.saveSymbols(DEFAULT_WATCHLIST);
        return [...DEFAULT_WATCHLIST];
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s) => typeof s === 'string' && TICKER_REGEX.test(s)).slice(0, MAX_WATCHLIST_ITEMS);
      }
    } catch (e) {
      console.warn('Failed to parse watchlist from localStorage:', e);
    }
    return [...DEFAULT_WATCHLIST];
  }

  saveSymbols(symbols) {
    const sanitized = Array.from(new Set(symbols))
      .filter((s) => typeof s === 'string' && TICKER_REGEX.test(s.trim()))
      .map((s) => s.trim().toUpperCase())
      .slice(0, MAX_WATCHLIST_ITEMS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    this.notifySubscribers(sanitized);
    return sanitized;
  }

  hasSymbol(symbol) {
    if (!symbol) return false;
    const clean = symbol.trim().toUpperCase();
    return this.getSymbols().includes(clean);
  }

  addSymbol(symbol) {
    if (!symbol) return false;
    const clean = symbol.trim().toUpperCase();
    if (!TICKER_REGEX.test(clean)) return false;

    const current = this.getSymbols();
    if (current.includes(clean)) return true;
    if (current.length >= MAX_WATCHLIST_ITEMS) {
      alert(`Watchlist limit reached (maximum ${MAX_WATCHLIST_ITEMS} assets). Please remove an asset first.`);
      return false;
    }

    current.unshift(clean);
    this.saveSymbols(current);
    return true;
  }

  removeSymbol(symbol) {
    if (!symbol) return;
    const clean = symbol.trim().toUpperCase();
    const current = this.getSymbols().filter((s) => s !== clean);
    this.saveSymbols(current);
  }

  clear() {
    this.saveSymbols([]);
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  notifySubscribers(symbols) {
    this.subscribers.forEach((cb) => {
      try {
        cb(symbols);
      } catch (err) {
        console.error('Subscriber error in WatchlistManager:', err);
      }
    });
  }

  // Multi-tab synchronization
  initStorageListener() {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        try {
          const updated = event.newValue ? JSON.parse(event.newValue) : [];
          this.notifySubscribers(updated);
        } catch (e) {
          console.warn('Failed to parse cross-tab storage event:', e);
        }
      }
    });
  }

  // Export Watchlist as JSON file
  exportBackup() {
    const symbols = this.getSymbols();
    const dataStr = JSON.stringify(
      {
        app: 'Apex Financial Terminal',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        watchlist: symbols,
      },
      null,
      2
    );

    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `apex_watchlist_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Import Watchlist with strict validation
  async importBackup(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target.result.trim();
          let importedSymbols = [];

          // Try parsing JSON first
          if (content.startsWith('{') || content.startsWith('[')) {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              importedSymbols = parsed;
            } else if (parsed && Array.isArray(parsed.watchlist)) {
              importedSymbols = parsed.watchlist;
            }
          } else {
            // Parse CSV / newline list
            importedSymbols = content
              .split(/[\r\n,]+/)
              .map((s) => s.trim())
              .filter(Boolean);
          }

          // Validate format and cap at 50
          const validSymbols = Array.from(new Set(importedSymbols))
            .filter((s) => typeof s === 'string' && TICKER_REGEX.test(s.trim()))
            .map((s) => s.trim().toUpperCase())
            .slice(0, MAX_WATCHLIST_ITEMS);

          if (validSymbols.length === 0) {
            reject(new Error('No valid ticker symbols found in file. Supported format: JSON array or comma-separated tickers.'));
            return;
          }

          this.saveSymbols(validSymbols);
          resolve(validSymbols);
        } catch (err) {
          reject(new Error('Failed to parse file: ' + err.message));
        }
      };

      reader.onerror = () => reject(new Error('File reading error.'));
      reader.readAsText(file);
    });
  }
}

export const watchlist = new WatchlistManager();
