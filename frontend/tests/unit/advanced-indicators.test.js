import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeIndicator, getAllIndicators } from '../../src/indicators.js';

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

test('every registered plot resolves to a calculable series', () => {
  const history = bars(Array.from({ length: 300 }, (_, i) => 100 + i / 10 + 3 * Math.sin(i / 6)),
    Array.from({ length: 300 }, (_, i) => 100 + i));
  const missing = [];
  for (const indicator of getAllIndicators()) {
    const result = computeIndicator(indicator.id, history);
    assert.equal(result.unavailable, false, `${indicator.id}: ${result.reason}`);
    for (const { key, type } of indicator.render) {
      if (!result.seriesData[key]?.some(({ value }) =>
        type === 'profile' ? value?.volumeProfile?.some((volume) => volume > 0) : Number.isFinite(value))) {
        missing.push(`${indicator.id}.${key}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
