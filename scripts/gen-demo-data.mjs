import { readFile, writeFile } from 'node:fs/promises';
import { intradaySeries, roundPrice, seededRandom, walkStep } from '../frontend/src/demo/simulator.js';

const fixture = new URL('../frontend/public/demo/market-overview.json', import.meta.url);
const snapshot = JSON.parse(await readFile(fixture, 'utf8'));
const assets = {
  indices: [
    ['^NSEI', 'NIFTY 50', 24812.76, .0028],
    ['^BSESN', 'SENSEX', 81263.69, .0027],
    ['^NSEBANK', 'BANK NIFTY', 51096.84, .004],
    ['^GSPC', 'S&P 500', 5829.17, .0021],
    ['^IXIC', 'NASDAQ Composite', 18447.86, .0037],
    ['^FTSE', 'FTSE 100', 8276.31, .002],
    ['^N225', 'Nikkei 225', 38731.26, .003],
    ['^HSI', 'Hang Seng', 20563.83, .0048],
    ['^SSEC', 'Shanghai Composite', 3378.59, .0025],
    ['^GDAXI', 'DAX', 19783.47, .0029],
    ['^FCHI', 'CAC 40', 7331.62, .0024],
    ['^GSPTSE', 'TSX Composite', 24903.59, .0025],
    ['^AXJO', 'ASX 200', 8279.18, .0027],
    ['BTC-USD', 'Bitcoin', 66849.73, .013],
  ],
  forex: [
    ['USDINR=X', 'USD/INR', 83.1472, .0007],
    ['EURUSD=X', 'EUR/USD', 1.0864, .0014],
    ['GBPUSD=X', 'GBP/USD', 1.2637, .0018],
  ],
  commodities: [
    ['GC=F', 'Gold', 2643.86, .0031],
    ['CL=F', 'Crude Oil', 79.13, .0065],
    ['SI=F', 'Silver', 30.97, .0055],
  ],
};

// A fixed historical session keeps visual reviews and test runs reproducible.
snapshot.timestamp = '2026-11-13T10:30:00Z';
for (const [category, entries] of Object.entries(assets)) {
  snapshot[category] = entries.map(([symbol, name, previousClose, volatility]) => {
    const precision = category === 'forex' ? 4 : 2;
    const series = intradaySeries(symbol, previousClose, volatility, precision);
    const price = series.at(-1);
    const change = roundPrice(price - previousClose, precision);
    return {
      symbol, name, price, change,
      change_pct: roundPrice(100 * change / previousClose),
      high: Math.max(...series),
      low: Math.min(...series),
      prev_close: previousClose,
      sparkline_data: series,
      source: 'Synthetic demo',
      source_timestamp: snapshot.timestamp,
      is_stale: false,
    };
  });
}
await writeFile(fixture, `${JSON.stringify(snapshot, null, 2)}\n`);

const sessions = [];
for (let date = Date.parse('2026-11-13T00:00:00Z'); sessions.length < 126; date -= 86400000) {
  const day = new Date(date).getUTCDay();
  if (day !== 0 && day !== 6) sessions.push(date / 1000);
}
sessions.reverse();
const histories = Object.fromEntries(assets.indices.map(([symbol, , , volatility], index) => {
  const quote = snapshot.indices[index];
  const random = seededRandom(`history:${symbol}`);
  let close = quote.prev_close;
  const candles = sessions.map((time, day) => {
    const open = roundPrice(close);
    close = roundPrice(walkStep(close, volatility * 4, random, .0003));
    return {
      time, open, close,
      high: roundPrice(Math.max(open, close) * (1 + random() * volatility)),
      low: roundPrice(Math.min(open, close) * (1 - random() * volatility)),
    };
  });
  const anchor = candles.at(-2).close;
  for (const bar of candles) {
    for (const key of ['open', 'close', 'high', 'low']) bar[key] = roundPrice(bar[key] * quote.prev_close / anchor);
  }
  Object.assign(candles.at(-1), {
    open: quote.sparkline_data[0], close: quote.price, high: quote.high, low: quote.low,
  });
  return [symbol, candles];
}));
const historyFile = new URL('benchmark-candles.json', fixture);
await writeFile(historyFile, `${JSON.stringify(histories)}\n`);
