/**
 * Deterministic candle generator for demo mode
 * Run with: node generate-candles.js
 * Outputs JSON files to frontend/public/demo/
 */
const fs = require('fs');
const path = require('path');

const DEMO_DIR = path.join(__dirname);

function generateMockCandles(basePrice = 3800, count = 120) {
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

// Generate candle files
for (const s of SYMBOLS) {
  const candles = generateMockCandles(s.basePrice, 250);
  const filename = `candles-${s.symbol.replace('.', '-')}.json`;
  fs.writeFileSync(path.join(DEMO_DIR, filename), JSON.stringify({
    symbol: s.symbol,
    name: s.name,
    interval: '1d',
    candles,
    demo_mode: true
  }, null, 2));
  console.log(`Generated ${filename} (${candles.length} candles)`);
}

// Generate overview files
for (const s of SYMBOLS) {
  const filename = `overview-${s.symbol.replace('.', '-')}.json`;
  fs.writeFileSync(path.join(DEMO_DIR, filename), JSON.stringify({
    symbol: s.symbol,
    name: s.name,
    price: s.basePrice,
    change: Math.round((Math.random() - 0.5) * 50 * 100) / 100,
    change_pct: Math.round((Math.random() - 0.5) * 3 * 100) / 100,
    market_cap: Math.round(s.basePrice * 1e9 / 1e7) * 1e7,
    pe_ratio: Math.round((15 + Math.random() * 20) * 100) / 100,
    pb_ratio: Math.round((2 + Math.random() * 5) * 100) / 100,
    dividend_yield: Math.round(Math.random() * 2 * 100) / 100,
    week_52_high: Math.round(s.basePrice * (1 + Math.random() * 0.3) * 100) / 100,
    week_52_low: Math.round(s.basePrice * (1 - Math.random() * 0.3) * 100) / 100,
    currency: s.symbol.endsWith('.NS') ? 'INR' : 'USD',
    exchange: s.symbol.endsWith('.NS') ? 'NSE' : 'NASDAQ',
    demo_mode: true
  }, null, 2));
  console.log(`Generated ${filename}`);
}

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