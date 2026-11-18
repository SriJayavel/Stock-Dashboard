/**
 * Mathematical Indicator Precision Benchmark.
 * Validates from-scratch indicators against analytical mathematical formulas.
 * 
 * Usage:
 *   node benchmarks/verify_indicators.mjs
 */
import { 
  calculateSMAValues, 
  calculateEMAValues, 
  calculateStdDevValues,
  computeIndicator 
} from '../frontend/src/indicators.js';

function generateDeterministicSeries(length = 200) {
  const series = [];
  let basePrice = 100.0;
  for (let i = 0; i < length; i++) {
    const time = 1700000000 + i * 86400;
    // Deterministic sinusoidal wave + linear drift
    const delta = Math.sin(i * 0.1) * 3.5 + Math.cos(i * 0.05) * 1.5 + (i * 0.02);
    basePrice += delta;
    const high = basePrice + 1.5;
    const low = basePrice - 1.2;
    const open = basePrice - 0.3;
    const close = basePrice + 0.2;
    const volume = 100000 + Math.floor(Math.abs(Math.sin(i)) * 50000);
    series.push({ time, open, high, low, close, volume });
  }
  return series;
}

function verifySMA(bars, period = 20) {
  const closes = bars.map(b => b.close);
  const calculated = calculateSMAValues(closes, period);
  
  let maxError = 0;
  let checks = 0;

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const expected = slice.reduce((a, b) => a + b, 0) / period;
    const actual = calculated[i];
    const error = Math.abs(actual - expected);
    if (error > maxError) maxError = error;
    checks++;
  }

  return { indicator: `SMA(${period})`, maxError, checks, pass: maxError < 1e-10 };
}

function verifyEMA(bars, period = 12) {
  const closes = bars.map(b => b.close);
  const calculated = calculateEMAValues(closes, period);
  const alpha = 2 / (period + 1);

  // Manual analytical accumulation
  let expectedEma = closes[0];
  let maxError = 0;
  let checks = 0;

  for (let i = 1; i < closes.length; i++) {
    expectedEma = closes[i] * alpha + expectedEma * (1 - alpha);
    if (i >= period - 1) {
      const actual = calculated[i];
      const error = Math.abs(actual - expectedEma);
      if (error > maxError) maxError = error;
      checks++;
    }
  }

  return { indicator: `EMA(${period})`, maxError, checks, pass: maxError < 1e-10 };
}

function verifyBollingerBands(bars, period = 20, multiplier = 2) {
  const bb = computeIndicator('bollinger', bars, { period, stdDev: multiplier });
  const closes = bars.map(b => b.close);
  const sma = calculateSMAValues(closes, period);
  const std = calculateStdDevValues(closes, period, sma);

  let maxErrorMiddle = 0;
  let maxErrorUpper = 0;
  let checks = 0;

  for (let i = period - 1; i < bars.length; i++) {
    const expMiddle = sma[i];
    const expUpper = sma[i] + multiplier * std[i];
    const actMiddle = bb.seriesData.middle[i].value;
    const actUpper = bb.seriesData.upper[i].value;

    const errM = Math.abs(actMiddle - expMiddle);
    const errU = Math.abs(actUpper - expUpper);

    if (errM > maxErrorMiddle) maxErrorMiddle = errM;
    if (errU > maxErrorUpper) maxErrorUpper = errU;
    checks++;
  }

  const overallMax = Math.max(maxErrorMiddle, maxErrorUpper);
  return { indicator: `BollingerBands(${period},${multiplier})`, maxError: overallMax, checks, pass: overallMax < 1e-10 };
}

function verifyRSIBounds(bars, period = 14) {
  const rsi = computeIndicator('rsi', bars, { period });
  let inBounds = true;
  let checks = 0;

  for (let i = period; i < bars.length; i++) {
    const val = rsi.seriesData.rsi[i].value;
    if (val < 0 || val > 100 || isNaN(val)) {
      inBounds = false;
    }
    checks++;
  }

  return { indicator: `RSI(${period}) Bounds [0, 100]`, maxError: inBounds ? 0 : 1, checks, pass: inBounds };
}

console.log("=" .repeat(65));
console.log(" 📐 MATHEMATICAL INDICATOR PRECISION VERIFICATION");
console.log("=" .repeat(65));

const bars = generateDeterministicSeries(300);
const results = [
  verifySMA(bars, 20),
  verifySMA(bars, 50),
  verifyEMA(bars, 12),
  verifyEMA(bars, 26),
  verifyBollingerBands(bars, 20, 2),
  verifyRSIBounds(bars, 14)
];

for (const r of results) {
  const status = r.pass ? "[PASS]" : "[FAIL]";
  console.log(` ${status} ${r.indicator.padEnd(30)} Max Error: ${r.maxError.toExponential(4)} (${r.checks} bars)`);
}

const allPass = results.every(r => r.pass);
console.log("=" .repeat(65));
console.log(` Overall Status: ${allPass ? "ALL MATHEMATICAL CHECKS PASSED (Max Error < 1e-10)" : "FAILURES DETECTED"}`);
console.log("=" .repeat(65));
