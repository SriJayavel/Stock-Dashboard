import { seededRandom, walkStep, roundPrice } from './simulator.js';

const day = 86400;
const lastSession = Date.UTC(2026, 10, 13) / 1000;
const priceScale = { INR: 11, JPY: 36, KRW: 680, GBp: 12, ZAc: 30, TWD: 5 };

export function makeGlobalDemoAsset(listing) {
  const random = seededRandom(`global-history:${listing.symbol}`);
  const sessions = [];
  for (let time = lastSession; sessions.length < 260; time -= day) {
    const weekday = new Date(time * 1000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) sessions.push(time);
  }
  let close = (32 + random() * 90) * (priceScale[listing.currency] || 1);
  const candles = sessions.reverse().map(time => {
    const open = roundPrice(close);
    close = roundPrice(walkStep(close, 0.036, random, 0.0002));
    return {
      time, open, close,
      high: roundPrice(Math.max(open, close) * (1 + random() * 0.012)),
      low: roundPrice(Math.min(open, close) * (1 - random() * 0.012)),
    };
  });
  const last = candles.at(-1);
  const prev_close = candles.at(-2).close;
  const change = roundPrice(last.close - prev_close);
  const source = {
    ...listing, demo_mode: true, data_source: 'Synthetic demo', freshness: 'synthetic',
    last_updated: new Date(last.time * 1000).toISOString(),
  };
  const quote = {
    ...source, demo_snapshot_only: true, chart_available: true, price: last.close, current_price: last.close,
    prev_close, change, change_pct: roundPrice(100 * change / prev_close),
    high_52w: Math.max(...candles.slice(-252).map(bar => bar.high)),
    low_52w: Math.min(...candles.slice(-252).map(bar => bar.low)),
  };
  return { source, quote, candles };
}

export function makeCrossAssetDemo(listing, sample, history) {
  const random = seededRandom(`cross-asset:${listing.symbol}`);
  const continuous = listing.category === 'Crypto';
  const precision = listing.price_precision;
  const round = value => roundPrice(value, precision);
  const volatility = listing.category === 'Forex' ? 0.012 : continuous ? 0.08 : 0.052;
  let close = sample.price;
  let previous = sample.prev_close ?? round(walkStep(close, volatility, random));
  const candles = history || [];
  if (!history) {
    for (let time = lastSession; candles.length < 366; time -= day) {
      const weekday = new Date(time * 1000).getUTCDay();
      if (!continuous && (weekday === 0 || weekday === 6)) continue;
      const first = candles.length === 0;
      const high = Math.max(previous, close, first ? sample.high ?? 0 : 0);
      const low = Math.min(previous, close, first ? sample.low ?? close : close);
      candles.push({
        time, open: previous, close,
        high: round(high * (1 + random() * volatility / 4)),
        low: round(low * (1 - random() * volatility / 4)),
      });
      close = previous;
      previous = round(walkStep(close, volatility, random));
    }
    candles.reverse();
  }
  const last = candles.at(-1);
  const prev_close = candles.at(-2).close;
  const source = {
    ...listing, demo_mode: true, data_source: 'Synthetic demo', freshness: 'synthetic',
    last_updated: sample.source_timestamp || new Date(last.time * 1000).toISOString(),
  };
  return {
    source, candles,
    quote: {
      ...source, demo_snapshot_only: true, chart_available: true,
      price: last.close, current_price: last.close, prev_close,
      change: round(last.close - prev_close), change_pct: roundPrice((last.close / prev_close - 1) * 100),
    },
  };
}

export function globalDemoInterval(candles, interval) {
  if (interval === '1d') return candles;
  const buckets = new Map();
  for (const candle of candles) {
    const date = new Date(candle.time * 1000);
    const key = interval === '1mo' ? date.toISOString().slice(0, 7)
      : candle.time - ((date.getUTCDay() + 6) % 7) * day;
    const bucket = buckets.get(key);
    if (!bucket) buckets.set(key, { ...candle });
    else {
      bucket.close = candle.close;
      bucket.high = Math.max(bucket.high, candle.high);
      bucket.low = Math.min(bucket.low, candle.low);
    }
  }
  return [...buckets.values()];
}
