import { seededRandom, walkStep, roundPrice } from './simulator.js';

const day = 86400;
const lastSession = Date.UTC(2026, 10, 13) / 1000;
const priceScale = { JPY: 36, KRW: 680, GBp: 12, ZAc: 30, TWD: 5 };

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
    ...source, demo_snapshot_only: true, price: last.close, current_price: last.close,
    prev_close, change, change_pct: roundPrice(100 * change / prev_close),
    high_52w: Math.max(...candles.slice(-252).map(bar => bar.high)),
    low_52w: Math.min(...candles.slice(-252).map(bar => bar.low)),
  };
  return { source, quote, candles };
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
