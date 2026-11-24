import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeIndicator, getAllIndicators, searchIndicators } from '../../src/indicators.js';

const day = 86400;
const firstDay = Date.parse('2026-01-01T00:00:00Z') / 1000;
const bars = (closes, volumes = []) => closes.map((close, i) => ({
  time: firstDay + i * day, open: close, high: close + 1, low: close - 1, close, volume: volumes[i],
}));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
const series = (result, key) => result.seriesData[key].map((point) => point.value);

test('DEMA and TEMA align cascaded EMA warm-up and preserve period-one prices', () => {
  const history = bars([10, 20, 30, 40]);
  const dema = series(computeIndicator('dema', history, { period: 2 }), 'dema');
  const tema = series(computeIndicator('tema', history, { period: 2 }), 'tema');
  assert.deepEqual(dema.slice(0, 2), [null, null]);
  assert.deepEqual(tema.slice(0, 3), [null, null, null]);
  near(dema[2], 770 / 27);
  near(tema[3], 9910 / 243);
  assert.deepEqual(series(computeIndicator('tema', history, { period: 1 }), 'tema'), [10, 20, 30, 40]);
});

test('KAMA responds to directional movement and stays flat on flat prices', () => {
  const trending = computeIndicator('kama', bars([10, 11, 12]), { period: 2, fast: 2, slow: 30 });
  near(series(trending, 'kama')[2], 11 + 4 / 9);
  const flat = computeIndicator('kama', bars([10, 10, 10]), { period: 2 });
  assert.deepEqual(series(flat, 'kama'), [null, null, 10]);
});

test('Chandelier levels use rolling highs and lows and Wilder ATR', () => {
  const result = computeIndicator('chandelier_exit', bars([10, 13, 12]), { period: 2, multiplier: 2 });
  assert.deepEqual(series(result, 'long'), [null, 8, 9]);
  assert.deepEqual(series(result, 'short'), [null, 15, 16]);
});

test('anchored VWAP starts at the UTC date and rejects unavailable anchors and volume', () => {
  const history = bars([10, 20, 40, 80], [50, 1, 3, 0]);
  const anchored = computeIndicator('anchored_vwap', history, { anchorDate: '2026-01-02' });
  assert.deepEqual(series(anchored, 'vwap'), [null, 20, 35, 35]);
  assert.match(computeIndicator('anchored_vwap', history, { anchorDate: '2026-01-08' }).reason, /after/);
  assert.match(computeIndicator('anchored_vwap', history, { anchorDate: '2025-12-31' }).reason, /before/);
  assert.match(computeIndicator('anchored_vwap', history, { anchorDate: '2026-01-04' }).reason, /Volume data unavailable/);
  assert.equal(computeIndicator('anchored_vwap', bars([10, 20])).unavailable, true);
  assert.equal(computeIndicator('anchored_vwap', history, { anchorDate: '2026-02-30' }).params.anchorDate, '');
  const isoHistory = history.map((bar) => ({ ...bar, time: new Date(bar.time * 1000).toISOString() }));
  assert.deepEqual(series(computeIndicator('anchored_vwap', isoHistory, { anchorDate: '2026-01-02' }), 'vwap'),
    [null, 20, 35, 35]);
});

test('PPO scales by the slow EMA and delays its histogram until the signal is ready', () => {
  const result = computeIndicator('ppo', bars([10, 20, 30]), { fast: 1, slow: 2, signal: 2 });
  const ppo = series(result, 'ppo');
  const signal = series(result, 'signal');
  const hist = series(result, 'hist');
  near(ppo[1], 20);
  near(ppo[2], 400 / 23);
  assert.deepEqual(signal.slice(0, 2), [null, null]);
  near(hist[2], (ppo[2] - ppo[1]) / 3);
  assert.match(computeIndicator('ppo', bars([10, 20, 30]), { fast: 2, slow: 2 }).reason, /Fast period/);
});

test('squeeze distinguishes inside and outside channel with a separate momentum series', () => {
  const result = computeIndicator('volatility_squeeze', bars([10, 10, 30]), { period: 2 });
  assert.deepEqual(series(result, 'momentum'), [null, 0, 10]);
  assert.deepEqual(result.seriesData.squeeze.map(({ label }) => label),
    [undefined, 'Inside channel', 'Outside channel']);
});

test('additional moving averages use the correct seed, weights, and regression endpoint', () => {
  const history = bars([10, 20, 30, 40]);
  assert.deepEqual(series(computeIndicator('smma', history, { period: 2 }), 'value'), [null, 15, 22.5, 31.25]);
  assert.deepEqual(series(computeIndicator('alma', history, { period: 1 }), 'value'), [10, 20, 30, 40]);
  assert.deepEqual(series(computeIndicator('lsma', history, { period: 3 }), 'value'), [null, null, 30, 40]);
  assert.deepEqual(series(computeIndicator('linear_regression_slope', history, { period: 3 }), 'value'), [null, null, 10, 10]);
  assert.deepEqual(series(computeIndicator('standard_error', history, { period: 3 }), 'value'), [null, null, 0, 0]);
});

test('rank correlation averages ties and signed volume stays unavailable without volume', () => {
  const history = bars([10, 10, 20, 15], [40, 50, 60, 25]);
  const rank = series(computeIndicator('rank_correlation', history, { period: 3 }), 'value');
  near(rank[2], 50 * Math.sqrt(3));
  assert.deepEqual(series(computeIndicator('net_volume', history), 'value'), [null, 0, 60, -25]);
  assert.equal(computeIndicator('ease_of_movement', bars([10, 11, 12])).unavailable, true);
});

test('Zig Zag and fractals wait for confirming bars', () => {
  const history = bars([100, 120, 95, 130, 100, 125]);
  const zig = computeIndicator('zig_zag', history, { legs: 2, deviation: 5 });
  assert.deepEqual(series(zig, 'pivot'), [null, 121, 94, 131, 99, null]);
  assert.deepEqual(series(zig, 'swing'), [null, 121, 94, 131, 99, null]);
  const fractals = computeIndicator('williams_fractals', history, { period: 1 });
  assert.deepEqual(series(fractals, 'upper'), [null, 121, null, 131, null, null]);
  assert.deepEqual(series(fractals, 'lower'), [null, null, 94, null, 99, null]);
});

test('52-week range excludes earlier extrema and indicator aliases rank ahead of text matches', () => {
  const history = bars([1000, ...Array(364).fill(100)]);
  assert.match(computeIndicator('high_low_52_week', history.slice(0, 200)).reason, /52 weeks/);
  const range = computeIndicator('high_low_52_week', history);
  assert.equal(series(range, 'high')[363], null);
  assert.equal(series(range, 'high').at(-1), 101);
  assert.equal(series(range, 'low').at(-1), 99);
  assert.equal(searchIndicators('Linear Regression Curve')[0].id, 'lsma');
  assert.equal(searchIndicators('DMI')[0].id, 'adx');
  assert.equal(searchIndicators('52 week high low')[0].id, 'high_low_52_week');
});

test('every registered plot resolves to a calculable series', () => {
  const history = bars(Array.from({ length: 400 }, (_, i) => 100 + i / 10 + 5 * Math.sin(i / 6)),
    Array.from({ length: 400 }, (_, i) => 100 + i));
  const missing = [];
  for (const indicator of getAllIndicators()) {
    const result = computeIndicator(indicator.id, history);
    assert.equal(result.unavailable, false, `${indicator.id}: ${result.reason}`);
    for (const { key, type } of indicator.render) {
      const points = result.seriesData[key];
      if (type !== 'profile') {
        assert.ok(points?.every(({ value }) => value === null || Number.isFinite(value)), `${indicator.id}.${key} contains a non-finite value`);
      }
      if (!result.seriesData[key]?.some(({ value }) =>
        type === 'profile' ? value?.volumeProfile?.some((volume) => volume > 0) : Number.isFinite(value))) {
        missing.push(`${indicator.id}.${key}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
