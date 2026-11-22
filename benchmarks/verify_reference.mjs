import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculateEMAValues, calculateSMAValues, computeIndicator } from '../frontend/src/indicators.js';

const fixtures = ['TCS-NS', 'AAPL'];
const maximum = new Map();
for (const symbol of fixtures) {
  const { candles } = JSON.parse(readFileSync(new URL(`../frontend/public/demo/candles-${symbol}.json`, import.meta.url)));
  const closes = candles.map((bar) => bar.close);
  const python = spawnSync(process.env.MARA_PYTHON || 'python',
    [fileURLToPath(new URL('./pandas_reference.py', import.meta.url))],
    { input: JSON.stringify(closes), encoding: 'utf8' });
  if (python.error) throw python.error;
  assert.equal(python.status, 0, python.stderr);
  const { values, pandas } = JSON.parse(python.stdout);
  const bands = computeIndicator('bollinger', candles).seriesData;
  const rsi = computeIndicator('rsi', candles).seriesData.rsi;
  const macd = computeIndicator('macd', candles).seriesData.macd;
  const series = {
    sma: calculateSMAValues(closes, 20),
    ema: calculateEMAValues(closes, 12),
    upper: bands.upper.map((point) => point.value),
    lower: bands.lower.map((point) => point.value),
    rsi: rsi.map((point) => point.value),
    macd: macd.map((point) => point.value),
  };
  for (const [name, actual] of Object.entries(series)) {
    values.forEach((reference, i) => {
      if (reference[name] == null) return;
      assert.ok(Number.isFinite(actual[i]), `${symbol} ${name} missing at bar ${i}`);
      const error = Math.abs(actual[i] - reference[name]);
      assert.ok(error < 1e-8, `${symbol} ${name} at bar ${i}: ${error}`);
      maximum.set(name, Math.max(maximum.get(name) ?? 0, error));
    });
  }
  console.log(`[PASS] ${symbol}: ${candles.length} bars against pandas ${pandas}`);
}
for (const [name, error] of maximum) console.log(`${name} max absolute error: ${error.toExponential(4)}`);
