/**
 * Deterministic candle generator for demo mode
 * Run from the repository root: node scripts/gen-stock-candles.cjs --candles-only
 * Regenerates daily candles and their matching quote snapshots.
 */
const fs = require('fs');
const path = require('path');

const DEMO_DIR = path.join(__dirname, '..', 'frontend', 'public', 'demo');

const DAY_SECONDS = 86400;
const LAST_SESSION = Date.parse('2026-11-13T00:00:00Z') / 1000;
const roundPrice = (price) => Math.round(price * 100) / 100;

function seededRandom(symbol) {
  let state = 2166136261;
  for (const char of symbol) {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 1) / 4294967297;
  };
}

function generateDailyCandles(quote, count = 251) {
  const random = seededRandom(quote.symbol);
  const normal = () => Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
  const times = [];
  for (let time = LAST_SESSION; times.length < count; time -= DAY_SECONDS) {
    const day = new Date(time * 1000).getUTCDay();
    if (day > 0 && day < 6) times.push(time);
  }
  times.reverse();

  // Persistent shocks give neighboring sessions similar volatility without a fixed cycle.
  let close = 1;
  let volatility = 0.014;
  const candles = times.map((time) => {
    const shock = normal() * volatility;
    const open = close * Math.exp(normal() * volatility * 0.24);
    close = open * Math.exp(0.00025 + shock);
    const wick = Math.abs(normal()) * volatility * 0.45;
    const high = Math.max(open, close) * (1 + wick);
    const low = Math.min(open, close) / (1 + wick);
    const volume = Math.round(700000 * Math.exp(normal() * 0.32 + Math.abs(shock) * 22));
    volatility = Math.min(0.055, 0.002 + 0.78 * volatility + 0.17 * Math.abs(shock));
    return { time, open, high, low, close, volume };
  });

  const previousClose = quote.prev_close ?? roundPrice(quote.price / (1 + (quote.change_pct || 0) / 100));
  const scale = previousClose / candles.at(-2).close;
  return candles.map((bar, index) => {
    const open = roundPrice(bar.open * scale);
    const close = index === candles.length - 1 ? quote.price : roundPrice(bar.close * scale);
    return {
      time: bar.time, open,
      high: Math.max(open, close, roundPrice(bar.high * scale)),
      low: Math.min(open, close, roundPrice(bar.low * scale)),
      close, volume: bar.volume,
    };
  });
}

const SYMBOLS = [
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services', basePrice: 3800 },
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', basePrice: 2800 },
  { symbol: 'INFY.NS', name: 'Infosys', basePrice: 1650 },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', basePrice: 1700 },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', basePrice: 1100 },
  { symbol: 'AAPL', name: 'Apple Inc.', basePrice: 220 },
  { symbol: 'MSFT', name: 'Microsoft', basePrice: 410 },
  { symbol: 'GOOGL', name: 'Alphabet', basePrice: 165 },
  { symbol: 'NVDA', name: 'NVIDIA', basePrice: 850 },
  { symbol: 'TSLA', name: 'Tesla', basePrice: 250 },
];

// The watchlist snapshot and the chart's last daily candle share the same close.
for (const { symbol, name, basePrice } of SYMBOLS) {
  const fileSymbol = symbol.replace('.', '-');
  const overviewPath = path.join(DEMO_DIR, `overview-${fileSymbol}.json`);
  const overview = fs.existsSync(overviewPath)
    ? JSON.parse(fs.readFileSync(overviewPath, 'utf8'))
    : {
        symbol, name, price: basePrice, demo_mode: true,
        currency: symbol.endsWith('.NS') ? 'INR' : 'USD',
        exchange: symbol.endsWith('.NS') ? 'NSE' : 'NASDAQ',
      };
  const candles = generateDailyCandles(overview);
  const last = candles.at(-1);
  const prevClose = candles.at(-2).close;
  const change = roundPrice(last.close - prevClose);
  const lastUpdated = new Date(last.time * 1000).toISOString();
  const quote = {
    ...overview,
    price: last.close,
    change,
    change_pct: roundPrice(change / prevClose * 100),
    prev_close: prevClose,
    last_updated: lastUpdated,
    week_52_high: Math.max(...candles.map((bar) => bar.high)),
    week_52_low: Math.min(...candles.map((bar) => bar.low)),
  };
  fs.writeFileSync(overviewPath, JSON.stringify(quote, null, 2) + '\n');
  fs.writeFileSync(path.join(DEMO_DIR, `candles-${fileSymbol}.json`), JSON.stringify({
    symbol, name, interval: '1d', candles, demo_mode: true
  }, null, 2) + '\n');
  console.log(`Generated ${symbol} quote and ${candles.length} candles`);
}
if (process.argv.includes('--candles-only')) process.exit(0);

// Generate research dossier
for (const s of SYMBOLS) {
  const filename = `research-${s.symbol.replace('.', '-')}.json`;
  fs.writeFileSync(path.join(DEMO_DIR, filename), JSON.stringify({
    symbol: s.symbol,
    name: s.name,
    overview: {
      business_summary: `${s.name} is a leading company in its sector. This is synthetic demo data.`,
      sector: s.symbol.endsWith('.NS') ? 'Information Technology' : 'Technology',
      industry: 'Software & Services',
      employees: Math.floor(50000 + Math.random() * 200000),
      website: 'https://example.com'
    },
    financials: {
      revenue_ttm: Math.round(50000 + Math.random() * 200000),
      net_income_ttm: Math.round(5000 + Math.random() * 50000),
      eps_ttm: Math.round((50 + Math.random() * 100) * 100) / 100,
      book_value_per_share: Math.round((100 + Math.random() * 500) * 100) / 100,
      debt_to_equity: Math.round(Math.random() * 100) / 100,
      roe: Math.round((10 + Math.random() * 20) * 100) / 100,
      roa: Math.round((5 + Math.random() * 15) * 100) / 100
    },
    valuation: {
      pe_current: Math.round((15 + Math.random() * 20) * 100) / 100,
      pe_median_5y: Math.round((18 + Math.random() * 15) * 100) / 100,
      pe_percentile_5y: Math.round(Math.random() * 100),
      pb_current: Math.round((2 + Math.random() * 5) * 100) / 100,
      ev_ebitda: Math.round((10 + Math.random() * 15) * 100) / 100
    },
    peers: SYMBOLS.filter(p => p.symbol !== s.symbol).slice(0, 5).map(p => ({
      symbol: p.symbol,
      name: p.name,
      pe: Math.round((12 + Math.random() * 25) * 100) / 100,
      roe: Math.round((8 + Math.random() * 25) * 100) / 100,
      market_cap: Math.round(p.basePrice * 1e9 / 1e7) * 1e7
    })),
    demo_mode: true
  }, null, 2));
  console.log(`Generated ${filename}`);
}

// Generate deep research
for (const s of SYMBOLS) {
  const filename = `deep-research-${s.symbol.replace('.', '-')}.json`;
  fs.writeFileSync(path.join(DEMO_DIR, filename), JSON.stringify({
    symbol: s.symbol,
    name: s.name,
    quarterly_trends: [
      { quarter: 'Q3 2024', revenue: 100000, net_income: 12000, yoy_revenue_pct: 12.5, yoy_income_pct: 15.2 },
      { quarter: 'Q2 2024', revenue: 95000, net_income: 11000, yoy_revenue_pct: 10.1, yoy_income_pct: 13.8 },
      { quarter: 'Q1 2024', revenue: 90000, net_income: 10500, yoy_revenue_pct: 9.2, yoy_income_pct: 11.5 },
      { quarter: 'Q4 2023', revenue: 88000, net_income: 10000, yoy_revenue_pct: 8.7, yoy_income_pct: 10.2 }
    ],
    valuation_envelope: {
      pe_5y_min: 15.2, pe_5y_max: 35.8, pe_current: 24.5, pe_percentile: 62,
      pb_5y_min: 3.1, pb_5y_max: 8.5, pb_current: 5.2, pb_percentile: 58
    },
    corporate_actions: [
      { date: '2024-06-15', type: 'dividend', description: 'Final dividend ₹25/share', amount: 25 },
      { date: '2024-01-20', type: 'dividend', description: 'Interim dividend ₹15/share', amount: 15 }
    ],
    financial_health_score: {
      total: 78,
      profitability: 82,
      leverage: 75,
      liquidity: 80,
      efficiency: 74
    },
    anomaly_detection: {
      pe_outlier: false,
      dividend_yield_outlier: false,
      revenue_growth_deceleration: false
    },
    macro_correlation: {
      nifty_correlation: 0.72,
      usd_inr_correlation: -0.31,
      oil_correlation: 0.18
    },
    demo_mode: true
  }, null, 2));
  console.log(`Generated ${filename}`);
}

// Generate sectors
fs.writeFileSync(path.join(DEMO_DIR, 'sectors.json'), JSON.stringify({
  sectors: [
    { name: 'Technology', change_pct: 1.2, top_symbols: ['TCS.NS', 'INFY.NS', 'AAPL', 'MSFT'] },
    { name: 'Financial Services', change_pct: 0.8, top_symbols: ['HDFCBANK.NS', 'ICICIBANK.NS'] },
    { name: 'Healthcare', change_pct: 0.3, top_symbols: [] },
    { name: 'Energy', change_pct: -1.1, top_symbols: [] },
    { name: 'Consumer Cyclical', change_pct: 0.5, top_symbols: [] }
  ],
  demo_mode: true
}, null, 2));
console.log('Generated sectors.json');

// Generate correlation matrix
const corrSymbols = SYMBOLS.map(s => s.symbol);
const correlationMatrix = {};
for (const s1 of corrSymbols) {
  correlationMatrix[s1] = {};
  for (const s2 of corrSymbols) {
    if (s1 === s2) {
      correlationMatrix[s1][s2] = 1.0;
    } else {
      // Deterministic pseudo-correlation based on symbol hash
      const hash = (s1 + s2).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      correlationMatrix[s1][s2] = Math.round((0.3 + (hash % 70) / 100) * 100) / 100;
    }
  }
}
fs.writeFileSync(path.join(DEMO_DIR, 'correlation.json'), JSON.stringify({
  symbols: corrSymbols,
  matrix: correlationMatrix,
  demo_mode: true
}, null, 2));
console.log('Generated correlation.json');

// Generate screener
fs.writeFileSync(path.join(DEMO_DIR, 'screener.json'), JSON.stringify({
  universes: {
    'Indian Leaders': SYMBOLS.filter(s => s.symbol.endsWith('.NS')).map(s => s.symbol),
    'US Mega-Caps': SYMBOLS.filter(s => !s.symbol.endsWith('.NS')).map(s => s.symbol),
    'Semiconductors & AI': ['NVDA', 'TSM', 'ASML'],
    'Crypto': ['BTC-USD', 'ETH-USD']
  },
  results: {
    'Indian Leaders': SYMBOLS.filter(s => s.symbol.endsWith('.NS')).map(s => ({
      symbol: s.symbol,
      name: s.name,
      price: s.basePrice,
      change_pct: Math.round((Math.random() - 0.5) * 3 * 100) / 100,
      pe: Math.round((15 + Math.random() * 20) * 100) / 100,
      market_cap: Math.round(s.basePrice * 1e9 / 1e7) * 1e7
    }))
  },
  demo_mode: true
}, null, 2));
console.log('Generated screener.json');

console.log('\n✅ All demo data generated in', DEMO_DIR);
