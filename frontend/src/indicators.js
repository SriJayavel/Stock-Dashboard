/**
 * Mara - Client-Side Technical Indicator Engine & Registry
 * Provides pure mathematical computation for 37 technical indicators.
 *
 * Epistemological & Honesty Contracts:
 * 1. Warm-up bars are strictly null (never 0, never plotted).
 * 2. Compute on full fetched history to preserve long-period accuracy.
 * 3. Instruments without volume (e.g. cash indices, forex) return unavailable status for volume-gated indicators.
 * 4. Wilder's smoothing used where mathematically required (RSI, ATR, ADX).
 * 5. Zero speculative/signal language: strictly descriptive mathematical outputs.
 */

// --------------------------------------------------------------------------
// Muted 8-Tone Palette for Dynamic Multi-Series Assignment
// --------------------------------------------------------------------------
export const INDICATOR_PALETTE = [
  '#6366f1', // Indigo Slate
  '#2dd4bf', // Cool Teal
  '#a855f7', // Muted Violet
  '#38bdf8', // Steel Cyan
  '#fb7185', // Dusty Rose
  '#94a3b8', // Slate Neutral
  '#818cf8', // Periwinkle
  '#06b6d4', // Cyan Grey
];

// Helper to check if instrument has valid volume data
export function hasValidVolume(bars) {
  if (!bars || bars.length === 0) return false;
  let nonZeroCount = 0;
  for (let i = 0; i < Math.min(bars.length, 50); i++) {
    const v = bars[i].volume;
    if (v != null && v > 0) nonZeroCount++;
  }
  return nonZeroCount > 0;
}

// --------------------------------------------------------------------------
// Core Mathematical Primitives
// --------------------------------------------------------------------------

/**
 * Simple Moving Average (SMA)
 */
export function calculateSMAValues(values, period) {
  const result = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  result[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    result[i] = sum / period;
  }
  return result;
}

/**
 * Exponential Moving Average (EMA)
 * Matches pandas: Close.ewm(span=period, adjust=False).mean()
 */
export function calculateEMAValues(values, period) {
  const result = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return result;

  const alpha = 2 / (period + 1);
  let currentEma = values[0];
  const allEma = new Array(values.length);
  allEma[0] = currentEma;

  for (let i = 1; i < values.length; i++) {
    currentEma = values[i] * alpha + currentEma * (1 - alpha);
    allEma[i] = currentEma;
  }

  // Mask warmup bars (first period - 1 bars are null)
  for (let i = period - 1; i < values.length; i++) {
    result[i] = allEma[i];
  }
  return result;
}

/**
 * Weighted Moving Average (WMA)
 */
export function calculateWMAValues(values, period) {
  const result = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return result;

  const weightSum = (period * (period + 1)) / 2;

  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i - period + 1 + j] * (j + 1);
    }
    result[i] = sum / weightSum;
  }
  return result;
}

/**
 * Wilder's Smoothing
 * alpha = 1 / period, matches pandas: Series.ewm(alpha=1/period, adjust=False).mean()
 */
export function calculateWilderValues(values, period) {
  const result = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return result;

  const alpha = 1 / period;
  let currentVal = values[0];
  const allVals = new Array(values.length);
  allVals[0] = currentVal;

  for (let i = 1; i < values.length; i++) {
    currentVal = values[i] * alpha + currentVal * (1 - alpha);
    allVals[i] = currentVal;
  }

  // Mask warmup bars (first period - 1 bars are null)
  for (let i = period - 1; i < values.length; i++) {
    result[i] = allVals[i];
  }
  return result;
}

/**
 * Rolling Standard Deviation (Sample std, ddof=1)
 */
export function calculateStdDevValues(values, period) {
  const result = new Array(values.length).fill(null);
  if (values.length < period || period <= 1) return result;

  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i - j];
    }
    const mean = sum / period;
    let varSum = 0;
    for (let j = 0; j < period; j++) {
      const diff = values[i - j] - mean;
      varSum += diff * diff;
    }
    result[i] = Math.sqrt(varSum / (period - 1));
  }
  return result;
}

/**
 * True Range Series
 */
export function calculateTrueRange(bars) {
  const tr = new Array(bars.length).fill(0);
  if (bars.length === 0) return tr;
  tr[0] = bars[0].high - bars[0].low;
  for (let i = 1; i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }
  return tr;
}

// --------------------------------------------------------------------------
// Indicator Calculation Registry
// --------------------------------------------------------------------------

export const INDICATOR_REGISTRY = {
  // ==========================================
  // TIER 1: OVERLAYS
  // ==========================================

  sma: {
    id: 'sma',
    name: 'Simple Moving Average',
    short: 'SMA',
    group: 'overlay',
    pane: 'overlay',
    params: { period: 20 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 1, max: 500, default: 20 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'Sum(Close, N) / N',
    levels: [],
    render: [{ key: 'sma', type: 'line', title: 'SMA', defaultColor: '#6366f1' }],
    compute: (bars, p) => {
      const closes = bars.map((b) => b.close);
      const sma = calculateSMAValues(closes, p.period);
      return {
        sma: bars.map((b, i) => ({ time: b.time, value: sma[i] })),
      };
    },
  },

  ema: {
    id: 'ema',
    name: 'Exponential Moving Average',
    short: 'EMA',
    group: 'overlay',
    pane: 'overlay',
    params: { period: 20 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 1, max: 500, default: 20 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'α = 2 / (N + 1); EMA[i] = Close[i] · α + EMA[i-1] · (1 - α)',
    levels: [],
    render: [{ key: 'ema', type: 'line', title: 'EMA', defaultColor: '#e8b34e' }],
    compute: (bars, p) => {
      const closes = bars.map((b) => b.close);
      const ema = calculateEMAValues(closes, p.period);
      return {
        ema: bars.map((b, i) => ({ time: b.time, value: ema[i] })),
      };
    },
  },

  wma: {
    id: 'wma',
    name: 'Weighted Moving Average',
    short: 'WMA',
    group: 'overlay',
    pane: 'overlay',
    params: { period: 20 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 1, max: 500, default: 20 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'Sum(Close[i-N+1+j] · (j+1)) / (N · (N + 1) / 2)',
    levels: [],
    render: [{ key: 'wma', type: 'line', title: 'WMA', defaultColor: '#38bdf8' }],
    compute: (bars, p) => {
      const closes = bars.map((b) => b.close);
      const wma = calculateWMAValues(closes, p.period);
      return {
        wma: bars.map((b, i) => ({ time: b.time, value: wma[i] })),
      };
    },
  },

  bollinger: {
    id: 'bollinger',
    name: 'Bollinger Bands',
    short: 'BB',
    group: 'overlay',
    pane: 'overlay',
    params: { period: 20, stdDev: 2 },
    paramDefs: [
      { key: 'period', name: 'Period', type: 'number', min: 1, max: 200, default: 20 },
      { key: 'stdDev', name: 'StdDev Multiplier', type: 'number', min: 0.5, max: 5, step: 0.1, default: 2 },
    ],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'Middle = SMA(Close, N); Upper/Lower = Middle ± (StdDev · σ)',
    levels: [],
    render: [
      { key: 'upper', type: 'line', title: 'BB Upper', defaultColor: 'rgba(160, 160, 160, 0.4)', lineStyle: 2 },
      { key: 'middle', type: 'line', title: 'BB Middle', defaultColor: '#6366f1' },
      { key: 'lower', type: 'line', title: 'BB Lower', defaultColor: 'rgba(160, 160, 160, 0.4)', lineStyle: 2 },
    ],
    compute: (bars, p) => {
      const closes = bars.map((b) => b.close);
      const middle = calculateSMAValues(closes, p.period);
      const std = calculateStdDevValues(closes, p.period);
      const upper = new Array(bars.length).fill(null);
      const lower = new Array(bars.length).fill(null);

      for (let i = 0; i < bars.length; i++) {
        if (middle[i] != null && std[i] != null) {
          upper[i] = middle[i] + std[i] * p.stdDev;
          lower[i] = middle[i] - std[i] * p.stdDev;
        }
      }

      return {
        upper: bars.map((b, i) => ({ time: b.time, value: upper[i] })),
        middle: bars.map((b, i) => ({ time: b.time, value: middle[i] })),
        lower: bars.map((b, i) => ({ time: b.time, value: lower[i] })),
      };
    },
  },

  supertrend: {
    id: 'supertrend',
    name: 'Supertrend',
    short: 'ST',
    group: 'overlay',
    pane: 'overlay',
    params: { period: 10, multiplier: 3 },
    paramDefs: [
      { key: 'period', name: 'ATR Period', type: 'number', min: 1, max: 100, default: 10 },
      { key: 'multiplier', name: 'Multiplier', type: 'number', min: 0.5, max: 10, step: 0.5, default: 3 },
    ],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'HL/2 ± (Multiplier · ATR); Ratchet trailing stop on trend flip',
    levels: [],
    render: [{ key: 'supertrend', type: 'line', title: 'Supertrend', defaultColor: '#2dd4bf' }],
    compute: (bars, p) => {
      const tr = calculateTrueRange(bars);
      const atr = calculateWilderValues(tr, p.period);
      const st = new Array(bars.length).fill(null);

      let prevFinalUpper = 0;
      let prevFinalLower = 0;
      let trend = 1;

      for (let i = 0; i < bars.length; i++) {
        if (atr[i] == null) continue;

        const hl2 = (bars[i].high + bars[i].low) / 2;
        const basicUpper = hl2 + p.multiplier * atr[i];
        const basicLower = hl2 - p.multiplier * atr[i];

        let finalUpper = basicUpper;
        let finalLower = basicLower;

        if (i > 0 && atr[i - 1] != null) {
          if (basicUpper < prevFinalUpper || bars[i - 1].close > prevFinalUpper) {
            finalUpper = basicUpper;
          } else {
            finalUpper = prevFinalUpper;
          }

          if (basicLower > prevFinalLower || bars[i - 1].close < prevFinalLower) {
            finalLower = basicLower;
          } else {
            finalLower = prevFinalLower;
          }

          if (trend === 1) {
            if (bars[i].close < prevFinalLower) {
              trend = -1;
              st[i] = finalUpper;
            } else {
              st[i] = finalLower;
            }
          } else {
            if (bars[i].close > prevFinalUpper) {
              trend = 1;
              st[i] = finalLower;
            } else {
              st[i] = finalUpper;
            }
          }
        } else {
          st[i] = finalLower;
        }

        prevFinalUpper = finalUpper;
        prevFinalLower = finalLower;
      }

      return {
        supertrend: bars.map((b, i) => ({ time: b.time, value: st[i] })),
      };
    },
  },

  psar: {
    id: 'psar',
    name: 'Parabolic SAR',
    short: 'PSAR',
    group: 'overlay',
    pane: 'overlay',
    params: { step: 0.02, max: 0.2 },
    paramDefs: [
      { key: 'step', name: 'Acceleration Factor', type: 'number', min: 0.005, max: 0.1, step: 0.005, default: 0.02 },
      { key: 'max', name: 'Max Acceleration', type: 'number', min: 0.05, max: 0.5, step: 0.05, default: 0.2 },
    ],
    needsVolume: false,
    warmup: () => 3,
    formula: 'SAR[i+1] = SAR[i] + AF · (EP - SAR[i])',
    levels: [],
    render: [{ key: 'sar', type: 'line', title: 'PSAR', defaultColor: '#fb7185', lineStyle: 1 }],
    compute: (bars, p) => {
      const sar = new Array(bars.length).fill(null);
      if (bars.length < 3) return { sar: bars.map((b, i) => ({ time: b.time, value: sar[i] })) };

      let isBull = bars[1].close > bars[0].close;
      let af = p.step;
      let ep = isBull ? bars[1].high : bars[1].low;
      let curSar = isBull ? bars[0].low : bars[0].high;
      sar[1] = curSar;

      for (let i = 2; i < bars.length; i++) {
        let nextSar = curSar + af * (ep - curSar);

        if (isBull) {
          nextSar = Math.min(nextSar, bars[i - 1].low, bars[i - 2].low);
          if (bars[i].low < nextSar) {
            isBull = false;
            nextSar = ep;
            ep = bars[i].low;
            af = p.step;
          } else {
            if (bars[i].high > ep) {
              ep = bars[i].high;
              af = Math.min(af + p.step, p.max);
            }
          }
        } else {
          nextSar = Math.max(nextSar, bars[i - 1].high, bars[i - 2].high);
          if (bars[i].high > nextSar) {
            isBull = true;
            nextSar = ep;
            ep = bars[i].high;
            af = p.step;
          } else {
            if (bars[i].low < ep) {
              ep = bars[i].low;
              af = Math.min(af + p.step, p.max);
            }
          }
        }

        curSar = nextSar;
        sar[i] = curSar;
      }

      return {
        sar: bars.map((b, i) => ({ time: b.time, value: sar[i] })),
      };
    },
  },

  // ==========================================
  // TIER 1: MOMENTUM OSCILLATORS
  // ==========================================

  rsi: {
    id: 'rsi',
    name: 'Relative Strength Index',
    short: 'RSI',
    group: 'momentum',
    pane: 'separate',
    params: { period: 14 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 100, default: 14 }],
    needsVolume: false,
    warmup: (p) => p.period + 1,
    formula: 'RSI = 100 - (100 / (1 + AvgGain / AvgLoss)) [Wilder Smoothing]',
    levels: [30, 70],
    render: [{ key: 'rsi', type: 'line', title: 'RSI', defaultColor: '#6366f1' }],
    compute: (bars, p) => {
      const rsi = new Array(bars.length).fill(null);
      if (bars.length <= p.period) return { rsi: bars.map((b, i) => ({ time: b.time, value: rsi[i] })) };

      const alpha = 1 / p.period;
      let curGain = Math.max(0, bars[1].close - bars[0].close);
      let curLoss = Math.max(0, bars[0].close - bars[1].close);

      const allAvgGain = new Array(bars.length);
      const allAvgLoss = new Array(bars.length);
      allAvgGain[1] = curGain;
      allAvgLoss[1] = curLoss;

      for (let i = 2; i < bars.length; i++) {
        const diff = bars[i].close - bars[i - 1].close;
        const g = diff > 0 ? diff : 0;
        const l = diff < 0 ? -diff : 0;
        curGain = g * alpha + curGain * (1 - alpha);
        curLoss = l * alpha + curLoss * (1 - alpha);
        allAvgGain[i] = curGain;
        allAvgLoss[i] = curLoss;
      }

      for (let i = p.period; i < bars.length; i++) {
        const ag = allAvgGain[i];
        const al = allAvgLoss[i];
        if (ag != null && al != null) {
          if (al === 0) {
            rsi[i] = 100;
          } else {
            const rs = ag / al;
            rsi[i] = 100 - 100 / (1 + rs);
          }
        }
      }

      return {
        rsi: bars.map((b, i) => ({ time: b.time, value: rsi[i] })),
      };
    },
  },

  macd: {
    id: 'macd',
    name: 'Moving Average Convergence Divergence',
    short: 'MACD',
    group: 'momentum',
    pane: 'separate',
    params: { fast: 12, slow: 26, signal: 9 },
    paramDefs: [
      { key: 'fast', name: 'Fast Period', type: 'number', min: 2, max: 100, default: 12 },
      { key: 'slow', name: 'Slow Period', type: 'number', min: 2, max: 200, default: 26 },
      { key: 'signal', name: 'Signal Period', type: 'number', min: 1, max: 50, default: 9 },
    ],
    needsVolume: false,
    warmup: (p) => p.slow + p.signal,
    formula: 'MACD = EMA(fast) - EMA(slow); Signal = EMA(MACD, signal); Hist = MACD - Signal',
    levels: [0],
    render: [
      { key: 'macd', type: 'line', title: 'MACD', defaultColor: '#6366f1' },
      { key: 'signal', type: 'line', title: 'Signal', defaultColor: '#e8b34e' },
      { key: 'hist', type: 'histogram', title: 'Histogram', defaultColor: '#2dd4bf' },
    ],
    compute: (bars, p) => {
      const closes = bars.map((b) => b.close);

      // Raw unmasked EMAs matching pandas Close.ewm(adjust=False)
      const alphaFast = 2 / (p.fast + 1);
      const alphaSlow = 2 / (p.slow + 1);
      const alphaSig = 2 / (p.signal + 1);

      let curFast = closes[0];
      let curSlow = closes[0];
      const rawMacd = new Array(bars.length);
      rawMacd[0] = curFast - curSlow;

      for (let i = 1; i < bars.length; i++) {
        curFast = closes[i] * alphaFast + curFast * (1 - alphaFast);
        curSlow = closes[i] * alphaSlow + curSlow * (1 - alphaSlow);
        rawMacd[i] = curFast - curSlow;
      }

      let curSig = rawMacd[0];
      const rawSig = new Array(bars.length);
      rawSig[0] = curSig;

      for (let i = 1; i < bars.length; i++) {
        curSig = rawMacd[i] * alphaSig + curSig * (1 - alphaSig);
        rawSig[i] = curSig;
      }

      const macdValues = new Array(bars.length).fill(null);
      const signalValues = new Array(bars.length).fill(null);
      const histValues = new Array(bars.length).fill(null);

      const macdWarmup = p.slow - 1;
      const sigWarmup = p.slow + p.signal - 2;

      for (let i = macdWarmup; i < bars.length; i++) {
        macdValues[i] = rawMacd[i];
      }

      for (let i = sigWarmup; i < bars.length; i++) {
        signalValues[i] = rawSig[i];
        histValues[i] = rawMacd[i] - rawSig[i];
      }

      return {
        macd: bars.map((b, i) => ({ time: b.time, value: macdValues[i] })),
        signal: bars.map((b, i) => ({ time: b.time, value: signalValues[i] })),
        hist: bars.map((b, i) => ({
          time: b.time,
          value: histValues[i],
          color: (histValues[i] || 0) >= 0 ? '#3ecf8e' : '#f0655a',
        })),
      };
    },
  },

  stochastic: {
    id: 'stochastic',
    name: 'Stochastic Oscillator',
    short: 'STOCH',
    group: 'momentum',
    pane: 'separate',
    params: { periodK: 14, smoothK: 3, periodD: 3 },
    paramDefs: [
      { key: 'periodK', name: '%K Period', type: 'number', min: 1, max: 100, default: 14 },
      { key: 'smoothK', name: '%K Smoothing', type: 'number', min: 1, max: 20, default: 3 },
      { key: 'periodD', name: '%D Period', type: 'number', min: 1, max: 20, default: 3 },
    ],
    needsVolume: false,
    warmup: (p) => p.periodK + p.smoothK + p.periodD,
    formula: '%K = SMA((Close - LL) / (HH - LL) · 100, smoothK); %D = SMA(%K, periodD)',
    levels: [20, 80],
    render: [
      { key: 'k', type: 'line', title: '%K', defaultColor: '#6366f1' },
      { key: 'd', type: 'line', title: '%D', defaultColor: '#e8b34e' },
    ],
    compute: (bars, p) => {
      const rawK = new Array(bars.length).fill(null);

      for (let i = p.periodK - 1; i < bars.length; i++) {
        let hh = -Infinity;
        let ll = Infinity;
        for (let j = 0; j < p.periodK; j++) {
          hh = Math.max(hh, bars[i - j].high);
          ll = Math.min(ll, bars[i - j].low);
        }
        const diff = hh - ll;
        rawK[i] = diff > 0 ? ((bars[i].close - ll) / diff) * 100 : 50;
      }

      // Smooth %K
      const kValues = new Array(bars.length).fill(null);
      for (let i = p.periodK + p.smoothK - 2; i < bars.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = 0; j < p.smoothK; j++) {
          if (rawK[i - j] != null) {
            sum += rawK[i - j];
            count++;
          }
        }
        if (count === p.smoothK) kValues[i] = sum / p.smoothK;
      }

      // Calculate %D
      const dValues = new Array(bars.length).fill(null);
      for (let i = p.periodK + p.smoothK + p.periodD - 3; i < bars.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = 0; j < p.periodD; j++) {
          if (kValues[i - j] != null) {
            sum += kValues[i - j];
            count++;
          }
        }
        if (count === p.periodD) dValues[i] = sum / p.periodD;
      }

      return {
        k: bars.map((b, i) => ({ time: b.time, value: kValues[i] })),
        d: bars.map((b, i) => ({ time: b.time, value: dValues[i] })),
      };
    },
  },

  cci: {
    id: 'cci',
    name: 'Commodity Channel Index',
    short: 'CCI',
    group: 'momentum',
    pane: 'separate',
    params: { period: 20 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 100, default: 20 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'TP = (H+L+C)/3; CCI = (TP - SMA(TP)) / (0.015 · MeanDev(TP))',
    levels: [-100, 100],
    render: [{ key: 'cci', type: 'line', title: 'CCI', defaultColor: '#a855f7' }],
    compute: (bars, p) => {
      const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
      const smaTp = calculateSMAValues(tp, p.period);
      const cci = new Array(bars.length).fill(null);

      for (let i = p.period - 1; i < bars.length; i++) {
        if (smaTp[i] == null) continue;
        let devSum = 0;
        for (let j = 0; j < p.period; j++) {
          devSum += Math.abs(tp[i - j] - smaTp[i]);
        }
        const meanDev = devSum / p.period;
        cci[i] = meanDev === 0 ? 0 : (tp[i] - smaTp[i]) / (0.015 * meanDev);
      }

      return {
        cci: bars.map((b, i) => ({ time: b.time, value: cci[i] })),
      };
    },
  },

  williams_r: {
    id: 'williams_r',
    name: 'Williams %R',
    short: '%R',
    group: 'momentum',
    pane: 'separate',
    params: { period: 14 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 100, default: 14 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: '%R = (HighestHigh - Close) / (HighestHigh - LowestLow) · -100',
    levels: [-80, -20],
    render: [{ key: 'williamsR', type: 'line', title: '%R', defaultColor: '#fb7185' }],
    compute: (bars, p) => {
      const wr = new Array(bars.length).fill(null);
      for (let i = p.period - 1; i < bars.length; i++) {
        let hh = -Infinity;
        let ll = Infinity;
        for (let j = 0; j < p.period; j++) {
          hh = Math.max(hh, bars[i - j].high);
          ll = Math.min(ll, bars[i - j].low);
        }
        const range = hh - ll;
        wr[i] = range > 0 ? ((hh - bars[i].close) / range) * -100 : -50;
      }
      return {
        williamsR: bars.map((b, i) => ({ time: b.time, value: wr[i] })),
      };
    },
  },

  roc: {
    id: 'roc',
    name: 'Rate of Change',
    short: 'ROC',
    group: 'momentum',
    pane: 'separate',
    params: { period: 12 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 1, max: 100, default: 12 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: '((Close[i] - Close[i-N]) / Close[i-N]) · 100',
    levels: [0],
    render: [{ key: 'roc', type: 'line', title: 'ROC', defaultColor: '#2dd4bf' }],
    compute: (bars, p) => {
      const roc = new Array(bars.length).fill(null);
      for (let i = p.period; i < bars.length; i++) {
        const past = bars[i - p.period].close;
        roc[i] = past > 0 ? ((bars[i].close - past) / past) * 100 : 0;
      }
      return {
        roc: bars.map((b, i) => ({ time: b.time, value: roc[i] })),
      };
    },
  },

  // ==========================================
  // TIER 1: TREND STRENGTH & VOLATILITY
  // ==========================================

  adx: {
    id: 'adx',
    name: 'Average Directional Index',
    short: 'ADX',
    group: 'trend',
    pane: 'separate',
    params: { period: 14 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 100, default: 14 }],
    needsVolume: false,
    warmup: (p) => p.period * 2,
    formula: 'DX = 100 · |+DI - -DI| / (+DI + -DI); ADX = Wilder(DX, N)',
    levels: [20, 25],
    render: [
      { key: 'adx', type: 'line', title: 'ADX', defaultColor: '#6366f1' },
      { key: 'plusDI', type: 'line', title: '+DI', defaultColor: '#2dd4bf' },
      { key: 'minusDI', type: 'line', title: '-DI', defaultColor: '#fb7185' },
    ],
    compute: (bars, p) => {
      const len = bars.length;
      const adx = new Array(len).fill(null);
      const plusDI = new Array(len).fill(null);
      const minusDI = new Array(len).fill(null);

      if (len < p.period * 2) return {
        adx: bars.map((b, i) => ({ time: b.time, value: adx[i] })),
        plusDI: bars.map((b, i) => ({ time: b.time, value: plusDI[i] })),
        minusDI: bars.map((b, i) => ({ time: b.time, value: minusDI[i] })),
      };

      const tr = calculateTrueRange(bars);
      const plusDM = new Array(len).fill(0);
      const minusDM = new Array(len).fill(0);

      for (let i = 1; i < len; i++) {
        const upMove = bars[i].high - bars[i - 1].high;
        const downMove = bars[i - 1].low - bars[i].low;
        if (upMove > downMove && upMove > 0) plusDM[i] = upMove;
        if (downMove > upMove && downMove > 0) minusDM[i] = downMove;
      }

      const smoothTR = calculateWilderValues(tr, p.period);
      const smoothPlusDM = calculateWilderValues(plusDM, p.period);
      const smoothMinusDM = calculateWilderValues(minusDM, p.period);

      const dx = new Array(len).fill(null);
      const validDx = [];
      const validDxIndices = [];

      for (let i = p.period - 1; i < len; i++) {
        const str = smoothTR[i];
        if (str != null && str > 0) {
          const pdi = (smoothPlusDM[i] / str) * 100;
          const mdi = (smoothMinusDM[i] / str) * 100;
          plusDI[i] = pdi;
          minusDI[i] = mdi;
          const sum = pdi + mdi;
          const diff = Math.abs(pdi - mdi);
          const dxVal = sum > 0 ? (diff / sum) * 100 : 0;
          dx[i] = dxVal;
          validDx.push(dxVal);
          validDxIndices.push(i);
        }
      }

      if (validDx.length >= p.period) {
        const smoothDx = calculateWilderValues(validDx, p.period);
        for (let j = 0; j < validDx.length; j++) {
          adx[validDxIndices[j]] = smoothDx[j];
        }
      }

      return {
        adx: bars.map((b, i) => ({ time: b.time, value: adx[i] })),
        plusDI: bars.map((b, i) => ({ time: b.time, value: plusDI[i] })),
        minusDI: bars.map((b, i) => ({ time: b.time, value: minusDI[i] })),
      };
    },
  },

  atr: {
    id: 'atr',
    name: 'Average True Range',
    short: 'ATR',
    group: 'volatility',
    pane: 'separate',
    params: { period: 14 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 1, max: 100, default: 14 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'ATR = Wilder(TrueRange, N)',
    levels: [],
    render: [{ key: 'atr', type: 'line', title: 'ATR', defaultColor: '#a855f7' }],
    compute: (bars, p) => {
      const tr = calculateTrueRange(bars);
      const atr = calculateWilderValues(tr, p.period);
      return {
        atr: bars.map((b, i) => ({ time: b.time, value: atr[i] })),
      };
    },
  },

  // ==========================================
  // TIER 1: VOLUME INDICATORS
  // ==========================================

  obv: {
    id: 'obv',
    name: 'On-Balance Volume',
    short: 'OBV',
    group: 'volume',
    pane: 'separate',
    params: {},
    paramDefs: [],
    needsVolume: true,
    warmup: () => 1,
    formula: 'Cumulative volume signed by direction of Close vs PrevClose',
    levels: [],
    render: [{ key: 'obv', type: 'line', title: 'OBV', defaultColor: '#2dd4bf' }],
    compute: (bars) => {
      if (!hasValidVolume(bars)) {
        return { unavailable: true, reason: 'Volume data unavailable for this instrument' };
      }
      const obv = new Array(bars.length).fill(0);
      let currentObv = 0;
      obv[0] = currentObv;

      for (let i = 1; i < bars.length; i++) {
        const diff = bars[i].close - bars[i - 1].close;
        const vol = bars[i].volume || 0;
        if (diff > 0) currentObv += vol;
        else if (diff < 0) currentObv -= vol;
        obv[i] = currentObv;
      }

      return {
        obv: bars.map((b, i) => ({ time: b.time, value: obv[i] })),
      };
    },
  },

  vol_sma: {
    id: 'vol_sma',
    name: 'Volume Moving Average',
    short: 'Vol SMA',
    group: 'volume',
    pane: 'separate',
    params: { period: 20 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 1, max: 100, default: 20 }],
    needsVolume: true,
    warmup: (p) => p.period,
    formula: 'Sum(Volume, N) / N',
    levels: [],
    render: [{ key: 'volSma', type: 'line', title: 'Vol SMA', defaultColor: '#38bdf8' }],
    compute: (bars, p) => {
      if (!hasValidVolume(bars)) {
        return { unavailable: true, reason: 'Volume data unavailable for this instrument' };
      }
      const volumes = bars.map((b) => b.volume || 0);
      const sma = calculateSMAValues(volumes, p.period);
      return {
        volSma: bars.map((b, i) => ({ time: b.time, value: sma[i] })),
      };
    },
  },

  // ==========================================
  // TIER 2: ADVANCED OVERLAYS
  // ==========================================

  hma: {
    id: 'hma',
    name: 'Hull Moving Average',
    short: 'HMA',
    group: 'overlay',
    pane: 'overlay',
    params: { period: 9 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 200, default: 9 }],
    needsVolume: false,
    warmup: (p) => p.period + Math.round(Math.sqrt(p.period)),
    formula: 'WMA(2 · WMA(Close, N/2) - WMA(Close, N), sqrt(N))',
    levels: [],
    render: [{ key: 'hma', type: 'line', title: 'HMA', defaultColor: '#a855f7' }],
    compute: (bars, p) => {
      const closes = bars.map((b) => b.close);
      const halfN = Math.floor(p.period / 2);
      const sqrtN = Math.round(Math.sqrt(p.period));

      const wmaHalf = calculateWMAValues(closes, halfN);
      const wmaFull = calculateWMAValues(closes, p.period);

      const diff = new Array(bars.length).fill(null);
      for (let i = 0; i < bars.length; i++) {
        if (wmaHalf[i] != null && wmaFull[i] != null) {
          diff[i] = 2 * wmaHalf[i] - wmaFull[i];
        }
      }

      // Final WMA on diff
      const hma = new Array(bars.length).fill(null);
      const weightSum = (sqrtN * (sqrtN + 1)) / 2;

      for (let i = p.period + sqrtN - 2; i < bars.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = 0; j < sqrtN; j++) {
          const val = diff[i - sqrtN + 1 + j];
          if (val != null) {
            sum += val * (j + 1);
            count++;
          }
        }
        if (count === sqrtN) {
          hma[i] = sum / weightSum;
        }
      }

      return {
        hma: bars.map((b, i) => ({ time: b.time, value: hma[i] })),
      };
    },
  },

  keltner: {
    id: 'keltner',
    name: 'Keltner Channels',
    short: 'KC',
    group: 'overlay',
    pane: 'overlay',
    params: { period: 20, multiplier: 2, atrPeriod: 10 },
    paramDefs: [
      { key: 'period', name: 'EMA Period', type: 'number', min: 2, max: 200, default: 20 },
      { key: 'multiplier', name: 'ATR Multiplier', type: 'number', min: 0.5, max: 5, step: 0.1, default: 2 },
      { key: 'atrPeriod', name: 'ATR Period', type: 'number', min: 1, max: 100, default: 10 },
    ],
    needsVolume: false,
    warmup: (p) => Math.max(p.period, p.atrPeriod),
    formula: 'Middle = EMA(N); Bands = Middle ± (Multiplier · ATR)',
    levels: [],
    render: [
      { key: 'upper', type: 'line', title: 'KC Upper', defaultColor: 'rgba(56, 189, 248, 0.4)', lineStyle: 2 },
      { key: 'middle', type: 'line', title: 'KC Middle', defaultColor: '#38bdf8' },
      { key: 'lower', type: 'line', title: 'KC Lower', defaultColor: 'rgba(56, 189, 248, 0.4)', lineStyle: 2 },
    ],
    compute: (bars, p) => {
      const closes = bars.map((b) => b.close);
      const middle = calculateEMAValues(closes, p.period);
      const tr = calculateTrueRange(bars);
      const atr = calculateWilderValues(tr, p.atrPeriod);

      const upper = new Array(bars.length).fill(null);
      const lower = new Array(bars.length).fill(null);

      for (let i = 0; i < bars.length; i++) {
        if (middle[i] != null && atr[i] != null) {
          upper[i] = middle[i] + p.multiplier * atr[i];
          lower[i] = middle[i] - p.multiplier * atr[i];
        }
      }

      return {
        upper: bars.map((b, i) => ({ time: b.time, value: upper[i] })),
        middle: bars.map((b, i) => ({ time: b.time, value: middle[i] })),
        lower: bars.map((b, i) => ({ time: b.time, value: lower[i] })),
      };
    },
  },

  donchian: {
    id: 'donchian',
    name: 'Donchian Channels',
    short: 'DC',
    group: 'overlay',
    pane: 'overlay',
    params: { period: 20 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 200, default: 20 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'Upper = HighestHigh(N); Lower = LowestLow(N); Middle = (Upper + Lower) / 2',
    levels: [],
    render: [
      { key: 'upper', type: 'line', title: 'DC Upper', defaultColor: 'rgba(245, 158, 11, 0.4)', lineStyle: 2 },
      { key: 'middle', type: 'line', title: 'DC Middle', defaultColor: '#f59e0b' },
      { key: 'lower', type: 'line', title: 'DC Lower', defaultColor: 'rgba(245, 158, 11, 0.4)', lineStyle: 2 },
    ],
    compute: (bars, p) => {
      const upper = new Array(bars.length).fill(null);
      const lower = new Array(bars.length).fill(null);
      const middle = new Array(bars.length).fill(null);

      for (let i = p.period - 1; i < bars.length; i++) {
        let hh = -Infinity;
        let ll = Infinity;
        for (let j = 0; j < p.period; j++) {
          hh = Math.max(hh, bars[i - j].high);
          ll = Math.min(ll, bars[i - j].low);
        }
        upper[i] = hh;
        lower[i] = ll;
        middle[i] = (hh + ll) / 2;
      }

      return {
        upper: bars.map((b, i) => ({ time: b.time, value: upper[i] })),
        middle: bars.map((b, i) => ({ time: b.time, value: middle[i] })),
        lower: bars.map((b, i) => ({ time: b.time, value: lower[i] })),
      };
    },
  },

  envelope: {
    id: 'envelope',
    name: 'Moving Average Envelope',
    short: 'ENV',
    group: 'overlay',
    pane: 'overlay',
    params: { period: 20, percent: 2.5 },
    paramDefs: [
      { key: 'period', name: 'Period', type: 'number', min: 2, max: 200, default: 20 },
      { key: 'percent', name: 'Envelope %', type: 'number', min: 0.5, max: 20, step: 0.5, default: 2.5 },
    ],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'Middle = SMA(Close, N); Upper/Lower = Middle · (1 ± Percent / 100)',
    levels: [],
    render: [
      { key: 'upper', type: 'line', title: 'ENV Upper', defaultColor: 'rgba(163, 230, 53, 0.4)', lineStyle: 2 },
      { key: 'middle', type: 'line', title: 'ENV Middle', defaultColor: '#a3e635' },
      { key: 'lower', type: 'line', title: 'ENV Lower', defaultColor: 'rgba(163, 230, 53, 0.4)', lineStyle: 2 },
    ],
    compute: (bars, p) => {
      const closes = bars.map((b) => b.close);
      const middle = calculateSMAValues(closes, p.period);
      const upper = new Array(bars.length).fill(null);
      const lower = new Array(bars.length).fill(null);
      const factor = p.percent / 100;

      for (let i = 0; i < bars.length; i++) {
        if (middle[i] != null) {
          upper[i] = middle[i] * (1 + factor);
          lower[i] = middle[i] * (1 - factor);
        }
      }

      return {
        upper: bars.map((b, i) => ({ time: b.time, value: upper[i] })),
        middle: bars.map((b, i) => ({ time: b.time, value: middle[i] })),
        lower: bars.map((b, i) => ({ time: b.time, value: lower[i] })),
      };
    },
  },

  pivots: {
    id: 'pivots',
    name: 'Pivot Points (Standard)',
    short: 'PIVOT',
    group: 'overlay',
    pane: 'overlay',
    params: {},
    paramDefs: [],
    needsVolume: false,
    warmup: () => 2,
    formula: 'P = (H+L+C)/3; R1 = 2P - L; S1 = 2P - H; R2 = P + (H-L); S2 = P - (H-L)',
    levels: [],
    render: [
      { key: 'p', type: 'line', title: 'P', defaultColor: '#e8b34e' },
      { key: 'r1', type: 'line', title: 'R1', defaultColor: '#fb7185', lineStyle: 2 },
      { key: 's1', type: 'line', title: 'S1', defaultColor: '#2dd4bf', lineStyle: 2 },
      { key: 'r2', type: 'line', title: 'R2', defaultColor: '#fb7185', lineStyle: 3 },
      { key: 's2', type: 'line', title: 'S2', defaultColor: '#2dd4bf', lineStyle: 3 },
    ],
    compute: (bars) => {
      const p = new Array(bars.length).fill(null);
      const r1 = new Array(bars.length).fill(null);
      const s1 = new Array(bars.length).fill(null);
      const r2 = new Array(bars.length).fill(null);
      const s2 = new Array(bars.length).fill(null);

      for (let i = 1; i < bars.length; i++) {
        const prev = bars[i - 1];
        const pivot = (prev.high + prev.low + prev.close) / 3;
        const range = prev.high - prev.low;
        p[i] = pivot;
        r1[i] = 2 * pivot - prev.low;
        s1[i] = 2 * pivot - prev.high;
        r2[i] = pivot + range;
        s2[i] = pivot - range;
      }

      return {
        p: bars.map((b, i) => ({ time: b.time, value: p[i] })),
        r1: bars.map((b, i) => ({ time: b.time, value: r1[i] })),
        s1: bars.map((b, i) => ({ time: b.time, value: s1[i] })),
        r2: bars.map((b, i) => ({ time: b.time, value: r2[i] })),
        s2: bars.map((b, i) => ({ time: b.time, value: s2[i] })),
      };
    },
  },

  // ==========================================
  // TIER 2: ADVANCED MOMENTUM & TREND
  // ==========================================

  stoch_rsi: {
    id: 'stoch_rsi',
    name: 'Stochastic RSI',
    short: 'StochRSI',
    group: 'momentum',
    pane: 'separate',
    params: { rsiPeriod: 14, stochPeriod: 14, smoothK: 3, smoothD: 3 },
    paramDefs: [
      { key: 'rsiPeriod', name: 'RSI Period', type: 'number', min: 2, max: 100, default: 14 },
      { key: 'stochPeriod', name: 'Stochastic Period', type: 'number', min: 2, max: 100, default: 14 },
      { key: 'smoothK', name: '%K Smoothing', type: 'number', min: 1, max: 20, default: 3 },
      { key: 'smoothD', name: '%D Smoothing', type: 'number', min: 1, max: 20, default: 3 },
    ],
    needsVolume: false,
    warmup: (p) => p.rsiPeriod + p.stochPeriod + p.smoothK + p.smoothD,
    formula: 'StochRSI = (RSI - Min(RSI)) / (Max(RSI) - Min(RSI))',
    levels: [20, 80],
    render: [
      { key: 'k', type: 'line', title: '%K', defaultColor: '#6366f1' },
      { key: 'd', type: 'line', title: '%D', defaultColor: '#e8b34e' },
    ],
    compute: (bars, p) => {
      const rsiResult = INDICATOR_REGISTRY.rsi.compute(bars, { period: p.rsiPeriod }).rsi;
      const rsiValues = rsiResult.map((r) => r.value);
      const rawK = new Array(bars.length).fill(null);

      for (let i = p.rsiPeriod + p.stochPeriod - 1; i < bars.length; i++) {
        let minRsi = Infinity;
        let maxRsi = -Infinity;
        let count = 0;
        for (let j = 0; j < p.stochPeriod; j++) {
          const val = rsiValues[i - j];
          if (val != null) {
            minRsi = Math.min(minRsi, val);
            maxRsi = Math.max(maxRsi, val);
            count++;
          }
        }
        if (count === p.stochPeriod) {
          const diff = maxRsi - minRsi;
          rawK[i] = diff > 0 ? ((rsiValues[i] - minRsi) / diff) * 100 : 50;
        }
      }

      const kValues = new Array(bars.length).fill(null);
      for (let i = p.rsiPeriod + p.stochPeriod + p.smoothK - 2; i < bars.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = 0; j < p.smoothK; j++) {
          if (rawK[i - j] != null) {
            sum += rawK[i - j];
            count++;
          }
        }
        if (count === p.smoothK) kValues[i] = sum / p.smoothK;
      }

      const dValues = new Array(bars.length).fill(null);
      for (let i = p.rsiPeriod + p.stochPeriod + p.smoothK + p.smoothD - 3; i < bars.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = 0; j < p.smoothD; j++) {
          if (kValues[i - j] != null) {
            sum += kValues[i - j];
            count++;
          }
        }
        if (count === p.smoothD) dValues[i] = sum / p.smoothD;
      }

      return {
        k: bars.map((b, i) => ({ time: b.time, value: kValues[i] })),
        d: bars.map((b, i) => ({ time: b.time, value: dValues[i] })),
      };
    },
  },

  ao: {
    id: 'ao',
    name: 'Awesome Oscillator',
    short: 'AO',
    group: 'momentum',
    pane: 'separate',
    params: { fast: 5, slow: 34 },
    paramDefs: [
      { key: 'fast', name: 'Fast Period', type: 'number', min: 2, max: 50, default: 5 },
      { key: 'slow', name: 'Slow Period', type: 'number', min: 10, max: 200, default: 34 },
    ],
    needsVolume: false,
    warmup: (p) => p.slow,
    formula: 'AO = SMA(MedianPrice, 5) - SMA(MedianPrice, 34)',
    levels: [0],
    render: [{ key: 'ao', type: 'histogram', title: 'AO', defaultColor: '#2dd4bf' }],
    compute: (bars, p) => {
      const medians = bars.map((b) => (b.high + b.low) / 2);
      const smaFast = calculateSMAValues(medians, p.fast);
      const smaSlow = calculateSMAValues(medians, p.slow);

      const ao = new Array(bars.length).fill(null);
      for (let i = 0; i < bars.length; i++) {
        if (smaFast[i] != null && smaSlow[i] != null) {
          ao[i] = smaFast[i] - smaSlow[i];
        }
      }

      return {
        ao: bars.map((b, i) => ({
          time: b.time,
          value: ao[i],
          color: (ao[i] || 0) >= (ao[i - 1] || 0) ? '#3ecf8e' : '#f0655a',
        })),
      };
    },
  },

  momentum: {
    id: 'momentum',
    name: 'Momentum',
    short: 'MOM',
    group: 'momentum',
    pane: 'separate',
    params: { period: 10 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 1, max: 100, default: 10 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'Close[i] - Close[i-N]',
    levels: [0],
    render: [{ key: 'mom', type: 'line', title: 'MOM', defaultColor: '#38bdf8' }],
    compute: (bars, p) => {
      const mom = new Array(bars.length).fill(null);
      for (let i = p.period; i < bars.length; i++) {
        mom[i] = bars[i].close - bars[i - p.period].close;
      }
      return {
        mom: bars.map((b, i) => ({ time: b.time, value: mom[i] })),
      };
    },
  },

  trix: {
    id: 'trix',
    name: 'TRIX (Triple Smoothed EMA Rate of Change)',
    short: 'TRIX',
    group: 'momentum',
    pane: 'separate',
    params: { period: 18 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 100, default: 18 }],
    needsVolume: false,
    warmup: (p) => p.period * 3 + 1,
    formula: '1-Period % Rate of Change of Triple Exponentially Smoothed Close',
    levels: [0],
    render: [{ key: 'trix', type: 'line', title: 'TRIX', defaultColor: '#fb7185' }],
    compute: (bars, p) => {
      const closes = bars.map((b) => b.close);
      const ema1 = calculateEMAValues(closes, p.period);
      const valid1 = ema1.filter((v) => v != null);
      const ema2 = calculateEMAValues(valid1, p.period);
      const valid2 = ema2.filter((v) => v != null);
      const ema3 = calculateEMAValues(valid2, p.period);

      const trix = new Array(bars.length).fill(null);
      const offset = bars.length - ema3.length;

      for (let i = 1; i < ema3.length; i++) {
        const prev = ema3[i - 1];
        if (prev != null && prev !== 0 && ema3[i] != null) {
          trix[offset + i] = ((ema3[i] - prev) / prev) * 10000;
        }
      }

      return {
        trix: bars.map((b, i) => ({ time: b.time, value: trix[i] })),
      };
    },
  },

  ultimate_osc: {
    id: 'ultimate_osc',
    name: 'Ultimate Oscillator',
    short: 'UO',
    group: 'momentum',
    pane: 'separate',
    params: { p1: 7, p2: 14, p3: 28 },
    paramDefs: [
      { key: 'p1', name: 'Short Period', type: 'number', min: 2, max: 50, default: 7 },
      { key: 'p2', name: 'Medium Period', type: 'number', min: 5, max: 100, default: 14 },
      { key: 'p3', name: 'Long Period', type: 'number', min: 10, max: 200, default: 28 },
    ],
    needsVolume: false,
    warmup: (p) => p.p3,
    formula: '100 · (4 · Avg1 + 2 · Avg2 + Avg3) / (4 + 2 + 1) of Buying Pressure / True Range',
    levels: [30, 70],
    render: [{ key: 'uo', type: 'line', title: 'UO', defaultColor: '#a855f7' }],
    compute: (bars, p) => {
      const bp = new Array(bars.length).fill(0);
      const tr = new Array(bars.length).fill(0);

      for (let i = 1; i < bars.length; i++) {
        const prevClose = bars[i - 1].close;
        const trueMin = Math.min(bars[i].low, prevClose);
        const trueMax = Math.max(bars[i].high, prevClose);
        bp[i] = bars[i].close - trueMin;
        tr[i] = trueMax - trueMin;
      }

      const uo = new Array(bars.length).fill(null);

      for (let i = p.p3; i < bars.length; i++) {
        let bp1 = 0, tr1 = 0;
        let bp2 = 0, tr2 = 0;
        let bp3 = 0, tr3 = 0;

        for (let j = 0; j < p.p1; j++) { bp1 += bp[i - j]; tr1 += tr[i - j]; }
        for (let j = 0; j < p.p2; j++) { bp2 += bp[i - j]; tr2 += tr[i - j]; }
        for (let j = 0; j < p.p3; j++) { bp3 += bp[i - j]; tr3 += tr[i - j]; }

        const avg1 = tr1 > 0 ? bp1 / tr1 : 0;
        const avg2 = tr2 > 0 ? bp2 / tr2 : 0;
        const avg3 = tr3 > 0 ? bp3 / tr3 : 0;

        uo[i] = 100 * ((4 * avg1 + 2 * avg2 + avg3) / 7);
      }

      return {
        uo: bars.map((b, i) => ({ time: b.time, value: uo[i] })),
      };
    },
  },

  aroon: {
    id: 'aroon',
    name: 'Aroon',
    short: 'AROON',
    group: 'trend',
    pane: 'separate',
    params: { period: 14 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 100, default: 14 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'AroonUp = ((N - BarsSinceHH) / N) · 100; AroonDown = ((N - BarsSinceLL) / N) · 100',
    levels: [30, 70],
    render: [
      { key: 'aroonUp', type: 'line', title: 'Aroon Up', defaultColor: '#2dd4bf' },
      { key: 'aroonDown', type: 'line', title: 'Aroon Down', defaultColor: '#fb7185' },
    ],
    compute: (bars, p) => {
      const up = new Array(bars.length).fill(null);
      const down = new Array(bars.length).fill(null);

      for (let i = p.period; i < bars.length; i++) {
        let maxIdx = 0;
        let minIdx = 0;
        let maxVal = -Infinity;
        let minVal = Infinity;

        for (let j = 0; j <= p.period; j++) {
          const idx = i - p.period + j;
          if (bars[idx].high >= maxVal) {
            maxVal = bars[idx].high;
            maxIdx = j;
          }
          if (bars[idx].low <= minVal) {
            minVal = bars[idx].low;
            minIdx = j;
          }
        }

        up[i] = (maxIdx / p.period) * 100;
        down[i] = (minIdx / p.period) * 100;
      }

      return {
        aroonUp: bars.map((b, i) => ({ time: b.time, value: up[i] })),
        aroonDown: bars.map((b, i) => ({ time: b.time, value: down[i] })),
      };
    },
  },

  vortex: {
    id: 'vortex',
    name: 'Vortex Indicator',
    short: 'VTX',
    group: 'trend',
    pane: 'separate',
    params: { period: 14 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 100, default: 14 }],
    needsVolume: false,
    warmup: (p) => p.period + 1,
    formula: '+VM = |High - PrevLow|; -VM = |Low - PrevHigh|; VI± = Sum(VM±, N) / Sum(TR, N)',
    levels: [1.0],
    render: [
      { key: 'viPlus', type: 'line', title: 'VI+', defaultColor: '#2dd4bf' },
      { key: 'viMinus', type: 'line', title: 'VI-', defaultColor: '#fb7185' },
    ],
    compute: (bars, p) => {
      const viPlus = new Array(bars.length).fill(null);
      const viMinus = new Array(bars.length).fill(null);
      if (bars.length <= p.period) return {
        viPlus: bars.map((b, i) => ({ time: b.time, value: viPlus[i] })),
        viMinus: bars.map((b, i) => ({ time: b.time, value: viMinus[i] })),
      };

      const tr = calculateTrueRange(bars);
      const vmPlus = new Array(bars.length).fill(0);
      const vmMinus = new Array(bars.length).fill(0);

      for (let i = 1; i < bars.length; i++) {
        vmPlus[i] = Math.abs(bars[i].high - bars[i - 1].low);
        vmMinus[i] = Math.abs(bars[i].low - bars[i - 1].high);
      }

      for (let i = p.period; i < bars.length; i++) {
        let sumTR = 0;
        let sumVMPlus = 0;
        let sumVMMinus = 0;

        for (let j = 0; j < p.period; j++) {
          sumTR += tr[i - j];
          sumVMPlus += vmPlus[i - j];
          sumVMMinus += vmMinus[i - j];
        }

        if (sumTR > 0) {
          viPlus[i] = sumVMPlus / sumTR;
          viMinus[i] = sumVMMinus / sumTR;
        }
      }

      return {
        viPlus: bars.map((b, i) => ({ time: b.time, value: viPlus[i] })),
        viMinus: bars.map((b, i) => ({ time: b.time, value: viMinus[i] })),
      };
    },
  },

  // ==========================================
  // TIER 2: ADVANCED VOLATILITY
  // ==========================================

  bollinger_pct_b: {
    id: 'bollinger_pct_b',
    name: 'Bollinger %B',
    short: '%B',
    group: 'volatility',
    pane: 'separate',
    params: { period: 20, stdDev: 2 },
    paramDefs: [
      { key: 'period', name: 'Period', type: 'number', min: 2, max: 200, default: 20 },
      { key: 'stdDev', name: 'StdDev', type: 'number', min: 0.5, max: 5, step: 0.1, default: 2 },
    ],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: '%B = (Close - LowerBB) / (UpperBB - LowerBB)',
    levels: [0, 0.5, 1.0],
    render: [{ key: 'pctB', type: 'line', title: '%B', defaultColor: '#6366f1' }],
    compute: (bars, p) => {
      const bb = INDICATOR_REGISTRY.bollinger.compute(bars, p);
      const pctB = new Array(bars.length).fill(null);

      for (let i = 0; i < bars.length; i++) {
        const u = bb.upper[i].value;
        const l = bb.lower[i].value;
        if (u != null && l != null && u !== l) {
          pctB[i] = (bars[i].close - l) / (u - l);
        }
      }

      return {
        pctB: bars.map((b, i) => ({ time: b.time, value: pctB[i] })),
      };
    },
  },

  bollinger_bandwidth: {
    id: 'bollinger_bandwidth',
    name: 'Bollinger Bandwidth',
    short: 'Bandwidth',
    group: 'volatility',
    pane: 'separate',
    params: { period: 20, stdDev: 2 },
    paramDefs: [
      { key: 'period', name: 'Period', type: 'number', min: 2, max: 200, default: 20 },
      { key: 'stdDev', name: 'StdDev', type: 'number', min: 0.5, max: 5, step: 0.1, default: 2 },
    ],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'Bandwidth = ((UpperBB - LowerBB) / MiddleBB) · 100',
    levels: [],
    render: [{ key: 'bandwidth', type: 'line', title: 'Bandwidth', defaultColor: '#a855f7' }],
    compute: (bars, p) => {
      const bb = INDICATOR_REGISTRY.bollinger.compute(bars, p);
      const bw = new Array(bars.length).fill(null);

      for (let i = 0; i < bars.length; i++) {
        const u = bb.upper[i].value;
        const m = bb.middle[i].value;
        const l = bb.lower[i].value;
        if (u != null && l != null && m != null && m > 0) {
          bw[i] = ((u - l) / m) * 100;
        }
      }

      return {
        bandwidth: bars.map((b, i) => ({ time: b.time, value: bw[i] })),
      };
    },
  },

  historical_volatility: {
    id: 'historical_volatility',
    name: 'Historical Volatility',
    short: 'HV',
    group: 'volatility',
    pane: 'separate',
    params: { period: 20 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 200, default: 20 }],
    needsVolume: false,
    warmup: (p) => p.period + 1,
    formula: 'StdDev(ln(Close[i] / Close[i-1]), N) · sqrt(252) · 100',
    levels: [],
    render: [{ key: 'hv', type: 'line', title: 'HV', defaultColor: '#fb7185' }],
    compute: (bars, p) => {
      const hv = new Array(bars.length).fill(null);
      if (bars.length <= p.period) return { hv: bars.map((b, i) => ({ time: b.time, value: hv[i] })) };

      const logReturns = new Array(bars.length).fill(0);
      for (let i = 1; i < bars.length; i++) {
        logReturns[i] = Math.log(bars[i].close / bars[i - 1].close);
      }

      const annualFactor = Math.sqrt(252) * 100;

      for (let i = p.period; i < bars.length; i++) {
        let sum = 0;
        for (let j = 0; j < p.period; j++) {
          sum += logReturns[i - j];
        }
        const mean = sum / p.period;
        let varSum = 0;
        for (let j = 0; j < p.period; j++) {
          const diff = logReturns[i - j] - mean;
          varSum += diff * diff;
        }
        const std = Math.sqrt(varSum / (p.period - 1));
        hv[i] = std * annualFactor;
      }

      return {
        hv: bars.map((b, i) => ({ time: b.time, value: hv[i] })),
      };
    },
  },

  standard_deviation: {
    id: 'standard_deviation',
    name: 'Standard Deviation',
    short: 'StdDev',
    group: 'volatility',
    pane: 'separate',
    params: { period: 20 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 200, default: 20 }],
    needsVolume: false,
    warmup: (p) => p.period,
    formula: 'Sample Standard Deviation of Close over N periods',
    levels: [],
    render: [{ key: 'std', type: 'line', title: 'StdDev', defaultColor: '#38bdf8' }],
    compute: (bars, p) => {
      const closes = bars.map((b) => b.close);
      const std = calculateStdDevValues(closes, p.period);
      return {
        std: bars.map((b, i) => ({ time: b.time, value: std[i] })),
      };
    },
  },

  // ==========================================
  // TIER 2: ADVANCED VOLUME
  // ==========================================

  mfi: {
    id: 'mfi',
    name: 'Money Flow Index',
    short: 'MFI',
    group: 'volume',
    pane: 'separate',
    params: { period: 14 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 100, default: 14 }],
    needsVolume: true,
    warmup: (p) => p.period + 1,
    formula: 'MFI = 100 - (100 / (1 + PosMoneyFlow / NegMoneyFlow))',
    levels: [20, 80],
    render: [{ key: 'mfi', type: 'line', title: 'MFI', defaultColor: '#2dd4bf' }],
    compute: (bars, p) => {
      if (!hasValidVolume(bars)) {
        return { unavailable: true, reason: 'Volume data unavailable for this instrument' };
      }
      const mfi = new Array(bars.length).fill(null);
      if (bars.length <= p.period) return { mfi: bars.map((b, i) => ({ time: b.time, value: mfi[i] })) };

      const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
      const posFlow = new Array(bars.length).fill(0);
      const negFlow = new Array(bars.length).fill(0);

      for (let i = 1; i < bars.length; i++) {
        const rawMoneyFlow = tp[i] * (bars[i].volume || 0);
        if (tp[i] > tp[i - 1]) posFlow[i] = rawMoneyFlow;
        else if (tp[i] < tp[i - 1]) negFlow[i] = rawMoneyFlow;
      }

      for (let i = p.period; i < bars.length; i++) {
        let sumPos = 0;
        let sumNeg = 0;
        for (let j = 0; j < p.period; j++) {
          sumPos += posFlow[i - j];
          sumNeg += negFlow[i - j];
        }
        if (sumNeg === 0) {
          mfi[i] = 100;
        } else {
          const ratio = sumPos / sumNeg;
          mfi[i] = 100 - 100 / (1 + ratio);
        }
      }

      return {
        mfi: bars.map((b, i) => ({ time: b.time, value: mfi[i] })),
      };
    },
  },

  cmf: {
    id: 'cmf',
    name: 'Chaikin Money Flow',
    short: 'CMF',
    group: 'volume',
    pane: 'separate',
    params: { period: 20 },
    paramDefs: [{ key: 'period', name: 'Period', type: 'number', min: 2, max: 100, default: 20 }],
    needsVolume: true,
    warmup: (p) => p.period,
    formula: 'Sum(((Close - Low) - (High - Close)) / (High - Low) · Volume, N) / Sum(Volume, N)',
    levels: [0],
    render: [{ key: 'cmf', type: 'line', title: 'CMF', defaultColor: '#a3e635' }],
    compute: (bars, p) => {
      if (!hasValidVolume(bars)) {
        return { unavailable: true, reason: 'Volume data unavailable for this instrument' };
      }
      const cmf = new Array(bars.length).fill(null);
      const mfv = new Array(bars.length).fill(0);

      for (let i = 0; i < bars.length; i++) {
        const range = bars[i].high - bars[i].low;
        const vol = bars[i].volume || 0;
        if (range > 0) {
          const mult = (bars[i].close - bars[i].low - (bars[i].high - bars[i].close)) / range;
          mfv[i] = mult * vol;
        }
      }

      for (let i = p.period - 1; i < bars.length; i++) {
        let sumMfv = 0;
        let sumVol = 0;
        for (let j = 0; j < p.period; j++) {
          sumMfv += mfv[i - j];
          sumVol += bars[i - j].volume || 0;
        }
        cmf[i] = sumVol > 0 ? sumMfv / sumVol : 0;
      }

      return {
        cmf: bars.map((b, i) => ({ time: b.time, value: cmf[i] })),
      };
    },
  },

  ad_line: {
    id: 'ad_line',
    name: 'Accumulation / Distribution',
    short: 'A/D',
    group: 'volume',
    pane: 'separate',
    params: {},
    paramDefs: [],
    needsVolume: true,
    warmup: () => 1,
    formula: 'Cumulative Money Flow Volume',
    levels: [],
    render: [{ key: 'ad', type: 'line', title: 'A/D', defaultColor: '#e8b34e' }],
    compute: (bars) => {
      if (!hasValidVolume(bars)) {
        return { unavailable: true, reason: 'Volume data unavailable for this instrument' };
      }
      const ad = new Array(bars.length).fill(0);
      let currentAd = 0;

      for (let i = 0; i < bars.length; i++) {
        const range = bars[i].high - bars[i].low;
        const vol = bars[i].volume || 0;
        if (range > 0) {
          const mult = (bars[i].close - bars[i].low - (bars[i].high - bars[i].close)) / range;
          currentAd += mult * vol;
        }
        ad[i] = currentAd;
      }

      return {
        ad: bars.map((b, i) => ({ time: b.time, value: ad[i] })),
      };
    },
  },

  force_index: {
    id: 'force_index',
    name: 'Force Index',
    short: 'Force',
    group: 'volume',
    pane: 'separate',
    params: { period: 13 },
    paramDefs: [{ key: 'period', name: 'EMA Period', type: 'number', min: 1, max: 100, default: 13 }],
    needsVolume: true,
    warmup: (p) => p.period + 1,
    formula: 'EMA((Close[i] - Close[i-1]) · Volume, N)',
    levels: [0],
    render: [{ key: 'fi', type: 'line', title: 'Force Index', defaultColor: '#6366f1' }],
    compute: (bars, p) => {
      if (!hasValidVolume(bars)) {
        return { unavailable: true, reason: 'Volume data unavailable for this instrument' };
      }
      const rawForce = new Array(bars.length).fill(0);
      for (let i = 1; i < bars.length; i++) {
        rawForce[i] = (bars[i].close - bars[i - 1].close) * (bars[i].volume || 0);
      }
      const fi = calculateEMAValues(rawForce, p.period);
      return {
        fi: bars.map((b, i) => ({ time: b.time, value: fi[i] })),
      };
    },
  },

  chaikin_osc: {
    id: 'chaikin_osc',
    name: 'Chaikin Oscillator',
    short: 'Chaikin',
    group: 'volume',
    pane: 'separate',
    params: { fast: 3, slow: 10 },
    paramDefs: [
      { key: 'fast', name: 'Fast EMA', type: 'number', min: 1, max: 20, default: 3 },
      { key: 'slow', name: 'Slow EMA', type: 'number', min: 2, max: 50, default: 10 },
    ],
    needsVolume: true,
    warmup: (p) => p.slow,
    formula: 'EMA(A/D Line, 3) - EMA(A/D Line, 10)',
    levels: [0],
    render: [{ key: 'cho', type: 'histogram', title: 'Chaikin Osc', defaultColor: '#2dd4bf' }],
    compute: (bars, p) => {
      if (!hasValidVolume(bars)) {
        return { unavailable: true, reason: 'Volume data unavailable for this instrument' };
      }
      const adResult = INDICATOR_REGISTRY.ad_line.compute(bars).ad;
      const adValues = adResult.map((a) => a.value);

      const emaFast = calculateEMAValues(adValues, p.fast);
      const emaSlow = calculateEMAValues(adValues, p.slow);

      const cho = new Array(bars.length).fill(null);
      for (let i = 0; i < bars.length; i++) {
        if (emaFast[i] != null && emaSlow[i] != null) {
          cho[i] = emaFast[i] - emaSlow[i];
        }
      }

      return {
        cho: bars.map((b, i) => ({
          time: b.time,
          value: cho[i],
          color: (cho[i] || 0) >= 0 ? '#3ecf8e' : '#f0655a',
        })),
      };
    },
  },
};

// --------------------------------------------------------------------------
// Registry Queries and Helper Functions
// --------------------------------------------------------------------------

export function getIndicatorDefinition(indicatorId) {
  return INDICATOR_REGISTRY[indicatorId] || null;
}

export function getAllIndicators() {
  return Object.values(INDICATOR_REGISTRY);
}

export function getIndicatorsByGroup(group) {
  if (!group || group === 'all') return getAllIndicators();
  return Object.values(INDICATOR_REGISTRY).filter((ind) => ind.group === group);
}

// Compute an indicator with memoization & data honesty validation
const indicatorCache = new Map();

export function computeIndicator(indicatorId, bars, customParams = {}) {
  const def = INDICATOR_REGISTRY[indicatorId];
  if (!def) throw new Error(`Unknown indicator ID: ${indicatorId}`);

  const params = { ...def.params, ...customParams };
  const volFlag = def.needsVolume ? (hasValidVolume(bars) ? 'v1' : 'v0') : '';
  const cacheKey = `${indicatorId}_${JSON.stringify(params)}_${bars.length}_${bars[bars.length - 1]?.time || 0}_${volFlag}`;

  if (indicatorCache.has(cacheKey)) {
    return indicatorCache.get(cacheKey);
  }

  // Volume verification gate
  if (def.needsVolume && !hasValidVolume(bars)) {
    const unavailableRes = {
      unavailable: true,
      reason: 'Volume data unavailable for this instrument',
      definition: def,
      params,
    };
    indicatorCache.set(cacheKey, unavailableRes);
    return unavailableRes;
  }

  // Warmup length check
  const warmupBars = def.warmup ? def.warmup(params) : 0;
  if (bars.length < warmupBars) {
    const insufficientRes = {
      unavailable: true,
      reason: `Insufficient history for ${def.short} (requires minimum ${warmupBars} bars, received ${bars.length})`,
      definition: def,
      params,
    };
    indicatorCache.set(cacheKey, insufficientRes);
    return insufficientRes;
  }

  const seriesData = def.compute(bars, params);
  const result = {
    unavailable: false,
    seriesData,
    definition: def,
    params,
  };

  // Limit cache size to prevent memory leaks
  if (indicatorCache.size > 200) {
    indicatorCache.clear();
  }
  indicatorCache.set(cacheKey, result);
  return result;
}
