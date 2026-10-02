/**
 * Mara - Client Hash Router
 * Deep-linkable client routing with browser history support (Back / Forward).
 * Route patterns:
 *   #/symbol/:symbol/:tab
 *   #/symbol/:symbol
 *   #/screener/:universe?
 *   #/sectors
 */

export class HashRouter {
  constructor() {
    this.currentRoute = null;
    this.listeners = new Set();
    this.isNavigating = false;

    window.addEventListener('hashchange', () => this.handleHashChange());
  }

  /**
   * Parse a hash string into a structured route object
   * @param {string} hash - e.g. "#/symbol/TCS.NS/fundamentals"
   * @returns {Object} Route descriptor
   */
  parseHash(hash = window.location.hash) {
    const raw = (hash || '').replace(/^#\/?/, '').trim();
    if (!raw) {
      return { type: 'root', workspace: 'analyze', symbol: null, tab: null, raw: '' };
    }

    const parts = raw.split('/').map((p) => decodeURIComponent(p.trim())).filter(Boolean);
    const first = parts[0]?.toLowerCase();

    // #/markets or #/sectors
    if (first === 'markets' || first === 'sectors') {
      return {
        type: 'markets',
        workspace: 'markets',
        view: 'markets',
        tab: 'markets',
        raw,
      };
    }

    // #/discover or #/screener
    if (first === 'discover' || first === 'screener') {
      return {
        type: 'discover',
        workspace: 'discover',
        view: 'discover',
        universe: parts[1] || 'indian_leaders',
        raw,
      };
    }

    // #/compare or #/compare/:symbol
    if (first === 'compare') {
      return {
        type: 'compare',
        workspace: 'compare',
        view: 'compare',
        symbol: parts[1] ? parts[1].toUpperCase() : null,
        raw,
      };
    }

    // #/research or #/research/:symbol/:sub
    if (first === 'research') {
      return {
        type: 'research',
        workspace: 'research',
        view: 'research',
        symbol: parts[1] ? parts[1].toUpperCase() : null,
        subTab: parts[2] ? parts[2].toLowerCase() : 'news',
        raw,
      };
    }

    // #/monitor or #/monitor/:sub
    if (first === 'monitor') {
      return {
        type: 'monitor',
        workspace: 'monitor',
        view: 'monitor',
        subTab: parts[1] ? parts[1].toLowerCase() : 'watchlist',
        raw,
      };
    }

    // #/analyze/:symbol/:tab or #/symbol/:symbol/:tab
    if ((first === 'analyze' || first === 'symbol') && parts[1]) {
      return {
        type: 'symbol',
        workspace: 'analyze',
        view: 'analyze',
        symbol: parts[1].toUpperCase(),
        tab: parts[2] ? parts[2].toLowerCase() : 'chart',
        raw,
      };
    }

    // Direct ticker shorthand, e.g. #/TCS.NS or #/INFY.NS
    if (parts.length === 1 && !['markets', 'discover', 'screener', 'sectors', 'terminal', 'analyze', 'compare', 'research', 'monitor'].includes(first)) {
      return {
        type: 'symbol',
        workspace: 'analyze',
        view: 'analyze',
        symbol: parts[0].toUpperCase(),
        tab: 'chart',
        raw,
      };
    }

    return { type: 'unknown', workspace: 'analyze', view: 'analyze', parts, raw };
  }

  /**
   * Format URL route string for a symbol and tab
   * @param {string} symbol - e.g. "TCS.NS"
   * @param {string} tab - e.g. "fundamentals"
   * @returns {string} URL hash string e.g. "/symbol/TCS.NS/fundamentals"
   */
  formatSymbolRoute(symbol, tab = 'chart') {
    const cleanSym = encodeURIComponent(symbol.toUpperCase());
    const cleanTab = encodeURIComponent(tab.toLowerCase());
    return `/symbol/${cleanSym}/${cleanTab}`;
  }

  /**
   * Format URL route string for workspace
   */
  formatWorkspaceRoute(workspace, symbol = null, sub = null) {
    if (workspace === 'markets') return '/markets';
    if (workspace === 'discover') return sub ? `/discover/${encodeURIComponent(sub)}` : '/discover';
    if (workspace === 'analyze') {
      const sym = symbol ? encodeURIComponent(symbol.toUpperCase()) : 'TCS.NS';
      return `/symbol/${sym}/${encodeURIComponent(sub || 'chart')}`;
    }
    if (workspace === 'compare') return symbol ? `/compare/${encodeURIComponent(symbol.toUpperCase())}` : '/compare';
    if (workspace === 'research') {
      const sym = symbol ? encodeURIComponent(symbol.toUpperCase()) : 'TCS.NS';
      return `/research/${sym}/${encodeURIComponent(sub || 'news')}`;
    }
    if (workspace === 'monitor') return sub ? `/monitor/${encodeURIComponent(sub)}` : '/monitor';
    return '/markets';
  }

  /**
   * Format URL route string for screener
   * @param {string} universe
   */
  formatScreenerRoute(universe = 'indian_leaders') {
    return `/discover/${encodeURIComponent(universe)}`;
  }

  /**
   * Format URL route string for sectors
   */
  formatSectorsRoute() {
    return '/markets';
  }

  /**
   * Subscribe to route change notifications
   * @param {Function} callback - fn(route)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Navigate to a route without reloading the page
   * @param {string} path - e.g. "/symbol/TCS.NS/valuation"
   * @param {boolean} replace - Replace browser history entry instead of pushing
   */
  navigate(path, replace = false) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const targetHash = `#${cleanPath}`;

    if (window.location.hash === targetHash) return;

    this.isNavigating = true;
    if (replace) {
      window.location.replace(targetHash);
    } else {
      window.location.hash = targetHash;
    }

    const route = this.parseHash(targetHash);
    this.currentRoute = route;
    this.notify(route);

    setTimeout(() => {
      this.isNavigating = false;
    }, 50);
  }

  /**
   * Handle native browser hashchange event (back/forward or manual address bar edit)
   */
  handleHashChange() {
    if (this.isNavigating) return;
    const route = this.parseHash(window.location.hash);
    this.currentRoute = route;
    this.notify(route);
  }

  notify(route) {
    this.listeners.forEach((callback) => {
      try {
        callback(route);
      } catch (err) {
        console.error('Error in route change listener:', err);
      }
    });
  }

  /**
   * Initialize router on app startup.
   * If URL has no hash, normalizes to default fallback route.
   * If hash exists, dispatches the parsed route.
   * @param {Object} fallback - { symbol: 'TCS.NS', tab: 'chart' }
   */
  init(fallback = { symbol: 'TCS.NS', tab: 'chart' }) {
    const current = this.parseHash(window.location.hash);
    if (current.type === 'root' || current.type === 'unknown') {
      const defaultPath = this.formatSymbolRoute(fallback.symbol, fallback.tab);
      this.navigate(defaultPath, true);
    } else {
      this.currentRoute = current;
      this.notify(current);
    }
  }
}

export const router = new HashRouter();
