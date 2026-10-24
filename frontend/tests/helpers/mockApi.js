/**
 * Deterministic API Mocking and Test Authentication Helper for Playwright
 */

export const DEFAULT_BENCHMARKS = [
  { symbol: '^NSEI', name: 'NIFTY 50', price: 24850.25, change: 125.40, change_pct: 0.51, high: 24920.00, low: 24740.00, source: 'yfinance', is_stale: false },
  { symbol: '^BSESN', name: 'SENSEX', price: 81400.00, change: 380.00, change_pct: 0.47, high: 81650.00, low: 81100.00, source: 'yfinance', is_stale: false },
  { symbol: '^NSEBANK', name: 'BANK NIFTY', price: 51200.50, change: 210.00, change_pct: 0.41, high: 51450.00, low: 50980.00, source: 'yfinance', is_stale: false },
  { symbol: '^GSPC', name: 'S&P 500', price: 5850.75, change: 22.50, change_pct: 0.39, high: 5875.00, low: 5830.00, source: 'yfinance', is_stale: false },
  { symbol: '^IXIC', name: 'NASDAQ Composite', price: 18500.20, change: 95.30, change_pct: 0.52, high: 18580.00, low: 18410.00, source: 'yfinance', is_stale: false },
  { symbol: '^FTSE', name: 'FTSE 100', price: 8250.40, change: -15.20, change_pct: -0.18, high: 8280.00, low: 8230.00, source: 'yfinance', is_stale: false },
  { symbol: '^N225', name: 'NIKKEI 225', price: 38900.00, change: -120.00, change_pct: -0.31, high: 39150.00, low: 38720.00, source: 'yfinance', is_stale: false },
];

export function generateMockCandles(basePrice = 3800, count = 120) {
  const candles = [];
  const nowSec = Math.floor(Date.now() / 1000);
  const daySec = 86400;
  let price = basePrice;

  for (let i = count; i >= 0; i--) {
    const time = nowSec - i * daySec;
    const delta = (Math.sin(i * 0.2) * 15) + ((i % 5) - 2) * 5;
    const open = Math.round((price + delta * 0.5) * 100) / 100;
    const close = Math.round((price + delta) * 100) / 100;
    const high = Math.round((Math.max(open, close) + Math.abs(delta) * 0.6 + 5) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.abs(delta) * 0.6 - 5) * 100) / 100;
    const volume = 800000 + Math.floor(Math.abs(delta) * 50000);
    candles.push({ time, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

export async function setupTestAuth(page) {
  await page.addInitScript(() => {
    window.__MARA_TEST_AUTH__ = true;
    window.__PLAYWRIGHT_TEST__ = true;
  });
}

export async function setupMockApi(page, custom = {}) {
  // Prevent Supabase external requests from creating noise or failing tests
  await page.route('**/supabase.co/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null, error: null }),
    });
  });

  // /api/markets/overview
  await page.route('**/api/markets/overview', (route) => {
    if (custom.marketsOverview) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(custom.marketsOverview),
      });
    }

    const payload = {
      hero: {
        symbol: '^NSEI',
        name: 'NIFTY 50',
        price: 24850.25,
        change: 125.40,
        change_pct: 0.51,
        high: 24920.00,
        low: 24740.00,
        status: 'delayed',
        freshness: 'DELAYED',
        is_stale: false,
        source: 'yfinance',
        retrieved_at: new Date().toISOString(),
      },
      macro: {
        Indices: DEFAULT_BENCHMARKS,
        Forex: [
          { symbol: 'USDINR=X', name: 'USD / INR', price: 83.95, change: 0.05, change_pct: 0.06 },
          { symbol: 'EURINR=X', name: 'EUR / INR', price: 91.20, change: -0.10, change_pct: -0.11 },
        ],
        Commodities: [
          { symbol: 'GC=F', name: 'Gold Futures', price: 2720.50, change: 12.00, change_pct: 0.44 },
          { symbol: 'CL=F', name: 'Crude Oil WTI', price: 71.40, change: -0.85, change_pct: -1.18 },
        ],
        Crypto: [
          { symbol: 'BTC-USD', name: 'Bitcoin', price: 67500.00, change: 1250.00, change_pct: 1.89 },
          { symbol: 'ETH-USD', name: 'Ethereum', price: 2650.00, change: 45.00, change_pct: 1.73 },
        ],
      },
      feed_health: {
        Indices: 'DELAYED',
        Forex: 'DELAYED',
        Commodities: 'DELAYED',
        Crypto: 'DELAYED',
      },
      trending: [
        { symbol: 'TCS.NS', name: 'Tata Consultancy Services', price: 3845.50, change_pct: 0.64 },
        { symbol: 'INFY.NS', name: 'Infosys Limited', price: 1885.20, change_pct: 1.15 },
        { symbol: 'RELIANCE.NS', name: 'Reliance Industries', price: 2950.00, change_pct: 0.82 },
      ],
      market_status: 'open',
      last_attempted_at: new Date().toISOString(),
      last_successful_update: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      is_stale: false,
    };

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  // /api/markets/refresh
  await page.route('**/api/markets/refresh', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', refreshed_at: new Date().toISOString() }),
    });
  });

  // /api/stocks/*/history*
  await page.route(/\/api\/stocks\/[^/]+\/history/, (route) => {
    const url = route.request().url();
    const symMatch = url.match(/\/api\/stocks\/([^/?]+)\/history/);
    const symbol = symMatch ? decodeURIComponent(symMatch[1]) : 'TCS.NS';
    const isIndia = symbol.endsWith('.NS') || symbol.endsWith('.BO') || symbol.startsWith('^NSE') || symbol.startsWith('^BSE');

    const candles = generateMockCandles(symbol.includes('INFY') ? 1885 : 3845, 120);

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        symbol,
        currency: isIndia ? 'INR' : 'USD',
        exchange: isIndia ? 'NSE' : 'NASDAQ',
        exchange_timezone: isIndia ? 'IST' : 'EDT',
        timezone: isIndia ? 'Asia/Kolkata' : 'America/New_York',
        candles,
        source: 'Yahoo Finance',
        market_status: 'OPEN',
        freshness: 'DELAYED',
        last_updated: new Date().toISOString(),
      }),
    });
  });

  // /api/stocks/*/overview
  await page.route(/\/api\/stocks\/[^/]+\/overview/, (route) => {
    const url = route.request().url();
    const symMatch = url.match(/\/api\/stocks\/([^/?]+)\/overview/);
    const rawSym = symMatch ? symMatch[1] : 'TCS.NS';
    const symbol = decodeURIComponent(rawSym);
    const isInfy = symbol.includes('INFY');
    const isIndia = symbol.endsWith('.NS') || symbol.endsWith('.BO') || symbol.startsWith('^NSE') || symbol.startsWith('^BSE');

    const price = isInfy ? 1885.20 : 3845.50;
    const change = isInfy ? 21.40 : 24.30;
    const changePct = isInfy ? 1.15 : 0.64;

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        symbol,
        name: isInfy ? 'Infosys Limited' : 'Tata Consultancy Services Limited',
        price,
        change,
        change_pct: changePct,
        high: price + 25,
        low: price - 30,
        volume: 1450000,
        data_source: 'Yahoo Finance',
        exchange: isIndia ? 'NSE' : 'NASDAQ',
        exchange_timezone: isIndia ? 'IST' : 'EDT',
        timezone: isIndia ? 'Asia/Kolkata' : 'America/New_York',
        currency: isIndia ? 'INR' : 'USD',
        market_status: 'OPEN',
        freshness: 'DELAYED',
        last_updated: new Date().toISOString(),
        pe_ratio: isInfy ? 26.8 : 29.5,
        pb_ratio: isInfy ? 7.8 : 12.1,
        roe: 0.38,
        debt_to_equity: 0.05,
        ev_ebitda: 18.5,
      }),
    });
  });

  // /api/stocks/batch
  await page.route('**/api/stocks/batch', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { symbol: 'TCS.NS', name: 'Tata Consultancy Services', price: 3845.50, change: 24.30, change_pct: 0.64 },
        { symbol: 'INFY.NS', name: 'Infosys Limited', price: 1885.20, change: 21.40, change_pct: 1.15 },
        { symbol: 'RELIANCE.NS', name: 'Reliance Industries', price: 2950.00, change: 22.00, change_pct: 0.75 },
      ]),
    });
  });

  // /api/screener*
  await page.route(/\/api\/screener/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { symbol: 'RELIANCE.NS', name: 'Reliance Industries', sector: 'Energy', price: 2950.00, change: 22.00, change_pct: 0.75, market_cap: 1980000, pe: 24.5, volume: 4200000 },
        { symbol: 'TCS.NS', name: 'Tata Consultancy Services', sector: 'Technology', price: 3845.50, change: 24.30, change_pct: 0.64, market_cap: 1420000, pe: 29.5, volume: 1450000 },
        { symbol: 'HDFCBANK.NS', name: 'HDFC Bank Limited', sector: 'Financials', price: 1680.00, change: 12.50, change_pct: 0.75, market_cap: 1280000, pe: 19.2, volume: 6500000 },
        { symbol: 'INFY.NS', name: 'Infosys Limited', sector: 'Technology', price: 1885.20, change: 21.40, change_pct: 1.15, market_cap: 785000, pe: 26.8, volume: 3800000 },
      ]),
    });
  });

  // /api/search*
  await page.route(/\/api\/search/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { symbol: 'RELIANCE.NS', name: 'Reliance Industries Limited', exchange: 'NSE', type: 'Equity' },
        { symbol: 'INFY.NS', name: 'Infosys Limited', exchange: 'NSE', type: 'Equity' },
        { symbol: 'TCS.NS', name: 'Tata Consultancy Services', exchange: 'NSE', type: 'Equity' },
      ]),
    });
  });

  // /api/stocks/*/research
  await page.route(/\/api\/stocks\/[^/]+\/research/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        symbol: 'TCS.NS',
        company_name: 'Tata Consultancy Services Limited',
        revenue_cagr_3yr: 0.115,
        ebit_margin_avg_3yr: 0.245,
        roe_avg_3yr: 0.42,
        net_margin: 0.19,
        fcf_conversion: 0.88,
        leverage_ratio: 0.08,
        governance_score: 92,
        audited_years: ['FY22', 'FY23', 'FY24', 'FY25'],
        structural_observations: [
          'Unleveraged balance sheet with zero net long-term institutional debt.',
          'Sustained operating cash flow conversion exceeding 85% across multi-year cycles.',
        ],
      }),
    });
  });

  // /api/stocks/*/deep-research
  await page.route(/\/api\/stocks\/[^/]+\/deep-research/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        symbol: 'TCS.NS',
        financial_health_score: 88,
        score_breakdown: { profitability: 90, solvency: 95, growth: 80, efficiency: 87 },
        historical_multiples_envelope: {
          pe_p25: 24.5,
          pe_p50: 28.0,
          pe_p75: 32.5,
          current_pe: 29.5,
          current_percentile: 62.5,
        },
        peer_comparison: [
          { symbol: 'TCS.NS', name: 'TCS', pe: 29.5, pb: 12.1, roe: 42.0 },
          { symbol: 'INFY.NS', name: 'Infosys', pe: 26.8, pb: 7.8, roe: 38.0 },
          { symbol: 'WIPRO.NS', name: 'Wipro', pe: 21.0, pb: 3.2, roe: 15.5 },
        ],
      }),
    });
  });

  // /api/stocks/*/v4-intelligence
  await page.route(/\/api\/stocks\/[^/]+\/v4-intelligence/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        what_changed_30d: { has_data: true, lookback_date: '30D Ago', current_date: 'Today', kpis: [] },
        anomalies: [],
        fundamental_relationships: [],
        statement_quality: { score: 85, label: 'High' },
        filing_intelligence: { filings: [] },
      }),
    });
  });

  // /api/stocks/*/macro-explorer
  await page.route(/\/api\/stocks\/[^/]+\/macro-explorer/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        macro_factors: [
          { factor: 'USD/INR Exchange Rate', symbol: 'USDINR=X', correlation_1y: 0.65, correlation_90d: 0.42 },
          { factor: 'US 10Y Treasury Yield', symbol: '^TNX', correlation_1y: -0.35, correlation_90d: -0.18 },
        ],
      }),
    });
  });

  // /api/analytics/sectors
  await page.route('**/api/analytics/sectors', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sectors: [
          { sector: 'Technology', display_name: 'Information Technology', performance_24h_pct: 1.25, indian_proxy: '^CNXIT', benchmark_etf: 'XLK', leading_asset: 'TCS.NS', constituents: [{ symbol: 'TCS.NS', role: 'Anchor' }, { symbol: 'INFY.NS', role: 'Anchor' }] },
          { sector: 'Financials', display_name: 'Financial Services', performance_24h_pct: 0.85, indian_proxy: '^NSEBANK', benchmark_etf: 'XLF', leading_asset: 'HDFCBANK.NS', constituents: [{ symbol: 'HDFCBANK.NS', role: 'Anchor' }] },
          { sector: 'Energy', display_name: 'Oil & Gas / Energy', performance_24h_pct: -0.45, indian_proxy: '^CNXENERGY', benchmark_etf: 'XLE', leading_asset: 'RELIANCE.NS', constituents: [{ symbol: 'RELIANCE.NS', role: 'Anchor' }] },
          { sector: 'Healthcare', display_name: 'Pharmaceuticals', performance_24h_pct: 0.35, indian_proxy: '^CNXPHARMA', benchmark_etf: 'XLV', leading_asset: 'SUNPHARMA.NS', constituents: [{ symbol: 'SUNPHARMA.NS', role: 'Anchor' }] },
          { sector: 'Auto', display_name: 'Automobiles', performance_24h_pct: 1.45, indian_proxy: '^CNXAUTO', benchmark_etf: 'CARZ', leading_asset: 'TATAMOTORS.NS', constituents: [{ symbol: 'TATAMOTORS.NS', role: 'Anchor' }] },
          { sector: 'FMCG', display_name: 'Fast Moving Consumer Goods', performance_24h_pct: -0.15, indian_proxy: '^CNXFMCG', benchmark_etf: 'XLP', leading_asset: 'ITC.NS', constituents: [{ symbol: 'ITC.NS', role: 'Anchor' }] },
        ],
      }),
    });
  });

  // /api/analytics/correlation
  await page.route('**/api/analytics/correlation', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        symbols: ['TCS.NS', 'INFY.NS', '^NSEI', 'GC=F', 'BTC-USD'],
        matrix: [
          [1.00, 0.82, 0.76, -0.12, 0.24],
          [0.82, 1.00, 0.78, -0.09, 0.28],
          [0.76, 0.78, 1.00, -0.05, 0.31],
          [-0.12, -0.09, -0.05, 1.00, 0.15],
          [0.24, 0.28, 0.31, 0.15, 1.00],
        ],
        period: '1y',
      }),
    });
  });

  // /api/analytics/portfolio-risk
  await page.route('**/api/analytics/portfolio-risk', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        portfolio_var_95: 0.024,
        sharpe_ratio: 1.42,
        beta: 0.95,
      }),
    });
  });

  // /api/market/candles*
  await page.route(/\/api\/market\/candles/, (route) => {
    const url = route.request().url();
    const symMatch = url.match(/[?&]symbol=([^&]+)/);
    const symbol = symMatch ? decodeURIComponent(symMatch[1]) : 'TCS.NS';
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        symbol,
        candles: generateMockCandles(3800, 60),
      }),
    });
  });

  // /api/research/query
  await page.route('**/api/research/query', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: 'Research thesis verified against audited filings.',
      }),
    });
  });
}
