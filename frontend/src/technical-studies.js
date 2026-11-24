/**
 * Additional studies derived from the instrument's OHLCV history.
 * Registry metadata keeps these studies compatible with saved chart layouts.
 */
export function additionalTechnicalStudies({ sma, ema, availableEMA, availableSMA, trueRange, timestamp, toPoints }) {
  const number = (key, name, value, min = 1, max = 300, step = undefined) => ({
    key, name, type: 'number', min, max, default: value, ...(step === undefined ? {} : { step }),
  });
  const period = (value, min = 1) => number('period', 'Period', value, min);
  const plot = (key, title, type = 'line', defaultColor = undefined) => ({ key, title, type, defaultColor });
  const closes = bars => bars.map(bar => bar.close);
  const midpoint = ({ high, low }) => (high + low) / 2;
  const sum = values => values.reduce((total, value) => total + value, 0);
  const windowed = (values, length, calculate) => values.map((_, i) => {
    if (i + 1 < length) return null;
    const slice = values.slice(i + 1 - length, i + 1);
    return slice.every(Number.isFinite) ? calculate(slice) : null;
  });
  const ratio = (numerator, denominator) => denominator === 0 ? null : numerator / denominator;
  const difference = (left, right) => left.map((value, i) =>
    Number.isFinite(value) && Number.isFinite(right[i]) ? value - right[i] : null);
  const roc = (values, length) => values.map((value, i) =>
    i >= length && values[i - length] !== 0 ? 100 * (value / values[i - length] - 1) : null);
  const seededRMA = (values, length) => {
    let count = 0;
    let total = 0;
    let average = 0;
    return values.map(value => {
      if (!Number.isFinite(value)) {
        count = 0;
        total = 0;
        return null;
      }
      count++;
      if (count <= length) {
        total += value;
        if (count < length) return null;
        average = total / length;
      } else average += (value - average) / length;
      return average;
    });
  };
  const rsi = (values, length) => {
    const changes = values.map((value, i) => i ? value - values[i - 1] : null);
    const gains = seededRMA(changes.map(value => value == null ? null : Math.max(value, 0)), length);
    const losses = seededRMA(changes.map(value => value == null ? null : Math.max(-value, 0)), length);
    return gains.map((gain, i) => gain == null ? null
      : losses[i] === 0 ? (gain === 0 ? 50 : 100) : 100 * gain / (gain + losses[i]));
  };
  const fit = values => {
    const center = (values.length - 1) / 2;
    const mean = sum(values) / values.length;
    const offsets = values.map((_, i) => i - center);
    const slope = sum(offsets.map((x, i) => x * (values[i] - mean))) / sum(offsets.map(x => x * x));
    return { slope, mean, center, offsets };
  };
  const span52Weeks = 52 * 7 * 86400;
  const rollingExtreme = (bars, times, key, discard) => {
    const queue = [];
    let head = 0;
    return bars.map((bar, i) => {
      const cutoff = times[i] - span52Weeks;
      while (head < queue.length && times[queue[head]] <= cutoff) head++;
      while (queue.length > head && discard(bars[queue.at(-1)][key], bar[key])) queue.pop();
      queue.push(i);
      return cutoff < times[0] ? null : bars[queue[head]][key];
    });
  };
  const catalog = {};
  const add = (id, name, short, group, params, warmup, formula, render, calculate, options = {}) => {
    catalog[id] = {
      id, name, short, group, pane: group === 'overlay' ? 'overlay' : 'separate',
      advanced: true, paramDefs: params, params: Object.fromEntries(params.map(param => [param.key, param.default])),
      warmup, formula, render, ...options,
      compute: (bars, settings) => Object.fromEntries(Object.entries(calculate(bars, settings))
        .map(([key, values]) => [key, toPoints(bars, values)])),
    };
  };
  const line = (id, name, short, group, params, warmup, formula, calculate, options = {}) =>
    add(id, name, short, group, params, warmup, formula, [plot('value', short)],
      (bars, settings) => ({ value: calculate(bars, settings) }), options);
  const zero = { levels: [0] };

  line('alma', 'Arnaud Legoux Moving Average', 'ALMA', 'overlay',
    [period(9), number('offset', 'Gaussian offset', 0.85, 0, 1, 0.01), number('sigma', 'Sigma', 6, 0.1, 30, 0.1)],
    p => p.period, 'Gaussian-weighted closing prices. Offset sets the center and sigma sets the spread.',
    (bars, p) => {
      const center = p.offset * (p.period - 1);
      const width = p.period / p.sigma;
      const weights = Array.from({ length: p.period }, (_, i) => Math.exp(-0.5 * ((i - center) / width) ** 2));
      const total = sum(weights);
      return windowed(closes(bars), p.period, values => sum(values.map((value, i) => value * weights[i])) / total);
    });

  line('smma', 'Smoothed Moving Average', 'SMMA', 'overlay', [period(14)], p => p.period,
    'Starts at the period SMA. Thereafter the previous average moves by 1 / period of the difference.',
    (bars, p) => seededRMA(closes(bars), p.period), { aliases: ['RMA', 'Wilder moving average'] });

  line('hamming_ma', 'Hamming Moving Average', 'Hamming MA', 'overlay', [period(20, 2)], p => p.period,
    'Weights the close by the Hamming window, 0.54 − 0.46 × cos(2πi / (period − 1)).',
    (bars, p) => {
      const weights = Array.from({ length: p.period }, (_, i) => 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (p.period - 1)));
      const total = sum(weights);
      return windowed(closes(bars), p.period, values => sum(values.map((value, i) => value * weights[i])) / total);
    }, { aliases: ['Moving Average Hamming'] });

  line('lsma', 'Least Squares Moving Average', 'LSMA', 'overlay', [period(25, 2)], p => p.period,
    'Fits a least-squares line to the close and plots the last fitted value.',
    (bars, p) => windowed(closes(bars), p.period, values => {
      const { mean, slope, center } = fit(values);
      return mean + slope * center;
    }), { aliases: ['Linear Regression Curve', 'Linear Regression Moving Average'] });

  line('linear_regression_slope', 'Linear Regression Slope', 'LR Slope', 'trend', [period(14, 2)], p => p.period,
    'Least-squares slope of closing prices, in price units per bar.',
    (bars, p) => windowed(closes(bars), p.period, values => fit(values).slope), zero);

  line('trend_strength_index', 'Trend Strength Index', 'Trend Strength', 'trend', [period(14, 2)], p => p.period,
    'Pearson correlation between closing prices and bar order, from −1 to +1.',
    (bars, p) => windowed(closes(bars), p.period, values => {
      const { slope, mean, offsets } = fit(values);
      const dispersion = sum(values.map(value => (value - mean) ** 2));
      const timeVariance = sum(offsets.map(offset => offset ** 2));
      return dispersion > 0 ? Math.max(-1, Math.min(1, slope * Math.sqrt(timeVariance / dispersion))) : null;
    }), { levels: [-1, 0, 1] });

  line('standard_error', 'Standard Error', 'Std Error', 'volatility', [period(21, 3)], p => p.period,
    'Regression residual standard error, the square root of the residual sum of squares divided by period − 2.',
    (bars, p) => windowed(closes(bars), p.period, values => {
      const { mean, slope, offsets } = fit(values);
      return Math.sqrt(sum(values.map((value, i) => (value - mean - slope * offsets[i]) ** 2)) / (p.period - 2));
    }));

  line('volatility_close_to_close', 'Volatility Close-to-Close', 'CC Vol', 'volatility',
    [period(20, 2), number('annualization', 'Bars per year', 252, 1, 1000)], p => p.period + 1,
    'Annualized sample standard deviation of close-to-close log returns, expressed as a percentage.',
    (bars, p) => {
      const returns = bars.map((bar, i) => i && bars[i - 1].close > 0 && bar.close > 0
        ? Math.log(bar.close / bars[i - 1].close) : null);
      return windowed(returns, p.period, values => {
        const mean = sum(values) / values.length;
        const variance = sum(values.map(value => (value - mean) ** 2)) / (values.length - 1);
        return 100 * Math.sqrt(variance * p.annualization);
      });
    });

  line('volatility_zero_trend', 'Volatility Zero Trend Close-to-Close', 'Zero Trend Vol', 'volatility',
    [period(20, 2), number('annualization', 'Bars per year', 252, 1, 1000)], p => p.period + 1,
    'Annualized root mean square of close-to-close log returns, assuming zero average return.',
    (bars, p) => {
      const returns = bars.map((bar, i) => i && bars[i - 1].close > 0 && bar.close > 0
        ? Math.log(bar.close / bars[i - 1].close) : null);
      return windowed(returns, p.period, values =>
        100 * Math.sqrt(sum(values.map(value => value ** 2)) / values.length * p.annualization));
    });

  line('volatility_ohlc', 'Volatility O-H-L-C', 'OHLC Vol', 'volatility',
    [period(20, 2), number('annualization', 'Bars per year', 252, 1, 1000)], p => p.period,
    'Annualized Garman–Klass OHLC volatility estimate. Bars with nonpositive prices are omitted.',
    (bars, p) => {
      const estimates = bars.map(({ open, high, low, close }) => {
        if (!(open > 0 && high > 0 && low > 0 && close > 0)) return null;
        const logRange = Math.log(high / low);
        const logBody = Math.log(close / open);
        return 0.5 * logRange ** 2 - (2 * Math.log(2) - 1) * logBody ** 2;
      });
      return windowed(estimates, p.period, values =>
        100 * Math.sqrt(Math.max(0, sum(values) / values.length * p.annualization)));
    });

  line('mcginley_dynamic', 'McGinley Dynamic', 'McGinley', 'overlay', [period(14)], p => p.period,
    'Adapts the previous level by (close − prior level) / [period × (close / prior level)⁴].',
    (bars, p) => {
      let previous = bars[0].close;
      return bars.map(({ close }, i) => {
        if (i) {
          const divisor = previous !== 0 ? p.period * (close / previous) ** 4 : 0;
          previous = divisor > 0 ? previous + (close - previous) / divisor : close;
        }
        return i >= p.period - 1 && Number.isFinite(previous) ? previous : null;
      });
    });

  line('average_price', 'Average Price', 'OHLC4', 'overlay', [], () => 1,
    'Arithmetic mean of open, high, low, and close.', bars => bars.map(b => (b.open + b.high + b.low + b.close) / 4));
  line('median_price', 'Median Price', 'HL2', 'overlay', [], () => 1,
    'Midpoint of the bar high and low.', bars => bars.map(midpoint));
  line('typical_price', 'Typical Price', 'HLC3', 'overlay', [], () => 1,
    'Arithmetic mean of high, low, and close.', bars => bars.map(b => (b.high + b.low + b.close) / 3));

  add('high_low_52_week', '52-Week High/Low', '52W Range', 'overlay', [], () => 2,
    'Highest high and lowest low during the trailing 52 calendar weeks. Requires a full 52 weeks of loaded history.',
    [plot('high', '52-week high'), plot('low', '52-week low', 'line', '#a99a84')],
    bars => {
      const times = bars.map(bar => timestamp(bar.time));
      return {
        high: rollingExtreme(bars, times, 'high', (prior, value) => prior <= value),
        low: rollingExtreme(bars, times, 'low', (prior, value) => prior >= value),
      };
    }, {
      aliases: ['52 Week High Low', 'Yearly Range'],
      availability: bars => timestamp(bars.at(-1).time) - timestamp(bars[0].time) >= span52Weeks
        ? '' : 'Load at least 52 weeks of chart history',
    });

  line('balance_of_power', 'Balance of Power', 'BOP', 'momentum', [], () => 1,
    '(Close − open) divided by (high − low). Flat bars have no value.',
    bars => bars.map(b => ratio(b.close - b.open, b.high - b.low)), zero);

  line('majority_rule', 'Majority Rule', 'MR', 'momentum', [period(14)], p => p.period + 1,
    'Percentage of bars in the lookback that closed above the previous close.',
    (bars, p) => availableSMA(bars.map((bar, i) => i ? (bar.close > bars[i - 1].close ? 100 : 0) : null), p.period),
    { levels: [50] });

  line('accelerator_oscillator', 'Accelerator Oscillator', 'AC', 'momentum', [], () => 38,
    'Awesome Oscillator minus its 5-bar simple moving average.',
    bars => {
      const values = bars.map(midpoint);
      const ao = difference(sma(values, 5), sma(values, 34));
      return difference(ao, availableSMA(ao, 5));
    }, { ...zero, aliases: ['Acceleration Deceleration'] });

  line('chaikin_volatility', 'Chaikin Volatility', 'CHV', 'volatility',
    [period(10), number('change', 'Rate-of-change period', 10)], p => p.period + p.change,
    'Percentage change in the EMA of the high–low range.',
    (bars, p) => {
      const range = ema(bars.map(b => b.high - b.low), p.period);
      return range.map((value, i) => Number.isFinite(value) && Number.isFinite(range[i - p.change]) && range[i - p.change] !== 0
        ? 100 * (value / range[i - p.change] - 1) : null);
    }, zero);

  line('coppock_curve', 'Coppock Curve', 'Coppock', 'momentum',
    [number('fast', 'Short ROC period', 11), number('slow', 'Long ROC period', 14), period(10)],
    p => Math.max(p.fast, p.slow) + p.period,
    'Weighted moving average of the sum of two closing-price rates of change.',
    (bars, p) => {
      const prices = closes(bars);
      const fast = roc(prices, p.fast);
      const slow = roc(prices, p.slow);
      const combined = fast.map((value, i) => Number.isFinite(value) && Number.isFinite(slow[i]) ? value + slow[i] : null);
      const totalWeight = p.period * (p.period + 1) / 2;
      return windowed(combined, p.period, values => sum(values.map((value, i) => value * (i + 1))) / totalWeight);
    }, zero);

  line('dpo', 'Detrended Price Oscillator', 'DPO', 'momentum', [period(21, 3)], p => p.period,
    'Close from floor(period / 2) + 1 bars ago minus the current period SMA. Right-aligned.',
    (bars, p) => {
      const prices = closes(bars);
      const offset = Math.floor(p.period / 2) + 1;
      return sma(prices, p.period).map((value, i) => value == null ? null : prices[i - offset] - value);
    }, zero);

  add('fisher_transform', 'Fisher Transform', 'Fisher', 'momentum', [period(9, 2)], p => p.period + 1,
    'Log transform of a smoothed median price normalized within its rolling range. Trigger is Fisher one bar ago.',
    [plot('fisher', 'Fisher'), plot('trigger', 'Trigger', 'line', '#a99a84')],
    (bars, p) => {
      let normalized = 0;
      let previous = 0;
      const fisher = windowed(bars.map(midpoint), p.period, values => {
        const low = Math.min(...values);
        const high = Math.max(...values);
        const position = high === low ? 0 : 2 * (values.at(-1) - low) / (high - low) - 1;
        normalized = Math.max(-0.999, Math.min(0.999, 0.33 * position + 0.67 * normalized));
        previous = 0.5 * Math.log((1 + normalized) / (1 - normalized)) + 0.5 * previous;
        return previous;
      });
      return { fisher, trigger: [null, ...fisher.slice(0, -1)] };
    }, zero);

  line('mass_index', 'Mass Index', 'Mass', 'volatility',
    [number('smooth', 'EMA period', 9), period(25)], p => 2 * p.smooth + p.period - 2,
    'Rolling sum of EMA(high − low) divided by a second EMA of that same series.',
    (bars, p) => {
      const first = ema(bars.map(b => b.high - b.low), p.smooth);
      const second = availableEMA(first, p.smooth);
      return windowed(first.map((value, i) => Number.isFinite(second[i]) ? ratio(value, second[i]) : null), p.period, sum);
    }, { levels: [26.5, 27] });

  line('ease_of_movement', 'Ease of Movement', 'EOM', 'volume',
    [period(14), number('divisor', 'Volume divisor', 10000, 1, 100000000)], p => p.period + 1,
    'SMA of midpoint change × bar range × volume divisor / volume.',
    (bars, p) => availableSMA(bars.map((b, i) => i && b.volume > 0
      ? (midpoint(b) - midpoint(bars[i - 1])) * (b.high - b.low) * p.divisor / b.volume : null), p.period),
    { ...zero, needsVolume: true, aliases: ['EMV'] });

  add('net_volume', 'Net Volume', 'Net Vol', 'volume', [], () => 2,
    'Current volume with the sign of the change from the prior close.',
    [plot('value', 'Net Volume', 'histogram')],
    bars => ({ value: bars.map((b, i) => i && b.volume > 0 ? Math.sign(b.close - bars[i - 1].close) * b.volume : null) }),
    { ...zero, needsVolume: true });

  add('volume', 'Volume', 'VOL', 'volume', [], () => 1,
    'Trading volume reported for each bar.',
    [plot('value', 'Volume', 'histogram')],
    bars => ({ value: bars.map(bar => Number.isFinite(bar.volume) && bar.volume >= 0 ? bar.volume : null) }),
    { ...zero, needsVolume: true });

  line('accumulative_swing_index', 'Accumulative Swing Index', 'ASI', 'trend',
    [number('limit', 'Limit move in price units', 100, 0.01, 1000000, 0.01)], () => 2,
    'Running sum of Wilder’s Swing Index, scaled by the configurable maximum price move.',
    (bars, p) => {
      let cumulative = 0;
      return bars.map((bar, i) => {
        if (!i) return null;
        const previous = bars[i - 1];
        const a = Math.abs(bar.high - previous.close);
        const b = Math.abs(bar.low - previous.close);
        const c = bar.high - bar.low;
        const d = Math.abs(previous.close - previous.open);
        const r = (a >= b && a >= c ? a - b / 2 : b >= c ? b - a / 2 : c) + d / 4;
        const change = bar.close - previous.close + (bar.close - bar.open) / 2 + (previous.close - previous.open) / 4;
        if (r > 0) cumulative += 50 * change / r * Math.max(a, b) / p.limit;
        return cumulative;
      });
    });

  add('relative_vigor', 'Relative Vigor Index', 'RVI', 'momentum', [period(10)], p => p.period + 6,
    'Smoothed close–open divided by smoothed high–low. Signal weights the last four RVI values 1–2–2–1.',
    [plot('rvi', 'RVI'), plot('signal', 'Signal', 'line', '#a99a84')],
    (bars, p) => {
      const weighted = values => windowed(values, 4, ([a, b, c, d]) => (a + 2 * b + 2 * c + d) / 6);
      const numer = availableSMA(weighted(bars.map(b => b.close - b.open)), p.period);
      const denom = availableSMA(weighted(bars.map(b => b.high - b.low)), p.period);
      const rvi = numer.map((value, i) => Number.isFinite(value) && denom[i] > 0 ? value / denom[i] : null);
      return { rvi, signal: weighted(rvi) };
    }, zero);

  line('relative_volatility', 'Relative Volatility Index', 'Rel Vol Index', 'volatility',
    [period(10, 2), number('smooth', 'EMA period', 14)], p => p.period + p.smooth - 1,
    'Average of the high and low directional volatility ratios. Each ratio compares EMA of rising standard deviation with total directional deviation.',
    (bars, p) => {
      const directional = values => {
        const stdev = windowed(values, p.period, slice => {
          const mean = sum(slice) / slice.length;
          return Math.sqrt(sum(slice.map(value => (value - mean) ** 2)) / slice.length);
        });
        const rising = availableEMA(stdev.map((value, i) => value == null ? null : values[i] > values[i - 1] ? value : 0), p.smooth);
        const falling = availableEMA(stdev.map((value, i) => value == null ? null : values[i] < values[i - 1] ? value : 0), p.smooth);
        return rising.map((value, i) => value == null || falling[i] == null ? null
          : ratio(100 * value, value + falling[i]));
      };
      const high = directional(bars.map(bar => bar.high));
      const low = directional(bars.map(bar => bar.low));
      return high.map((value, i) => value == null || low[i] == null ? null : (value + low[i]) / 2);
    }, { levels: [50] });

  line('rank_correlation', 'Rank Correlation Index', 'RCI', 'momentum', [period(9, 2)], p => p.period,
    '100 × Spearman rank correlation of close and bar order. Equal closes share their average rank.',
    (bars, p) => windowed(closes(bars), p.period, values => {
      const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
      const ranks = Array(values.length);
      for (let start = 0; start < sorted.length;) {
        let end = start + 1;
        while (end < sorted.length && sorted[end].value === sorted[start].value) end++;
        const rank = (start + end - 1) / 2;
        for (let i = start; i < end; i++) ranks[sorted[i].index] = rank;
        start = end;
      }
      const midpoint = (values.length - 1) / 2;
      let covariance = 0, priceVariance = 0, timeVariance = 0;
      ranks.forEach((rank, i) => {
        const price = rank - midpoint;
        const time = i - midpoint;
        covariance += price * time;
        priceVariance += price * price;
        timeVariance += time * time;
      });
      return priceVariance ? 100 * covariance / Math.sqrt(priceVariance * timeVariance) : null;
    }), { levels: [-80, 0, 80] });

  line('connors_rsi', 'Connors RSI', 'CRSI', 'momentum',
    [period(3), number('streak', 'Streak RSI period', 2), number('rank', 'Percent-rank lookback', 100, 2)],
    p => Math.max(p.period + 1, p.streak + 1, p.rank + 2),
    'Average of price RSI, signed-streak RSI, and the percentile rank of the latest one-bar return.',
    (bars, p) => {
      const prices = closes(bars);
      let streak = 0;
      const streaks = prices.map((price, i) => {
        const direction = i ? Math.sign(price - prices[i - 1]) : 0;
        streak = direction === Math.sign(streak) ? streak + direction : direction;
        return streak;
      });
      const priceRSI = rsi(prices, p.period);
      const streakRSI = rsi(streaks, p.streak);
      const returns = roc(prices, 1);
      return priceRSI.map((value, i) => {
        if (i <= p.rank || value == null || streakRSI[i] == null || returns[i] == null) return null;
        const previous = returns.slice(i - p.rank, i);
        if (!previous.every(Number.isFinite)) return null;
        const rank = 100 * previous.filter(change => change < returns[i]).length / p.rank;
        return (value + streakRSI[i] + rank) / 3;
      });
    }, { levels: [10, 90] });

  add('stochastic_momentum_index', 'Stochastic Momentum Index', 'SMI', 'momentum',
    [period(10, 2), number('smooth', 'Double EMA period', 3), number('signal', 'Signal EMA', 3)],
    p => p.period + 2 * (p.smooth - 1) + p.signal - 1,
    '200 × twice-smoothed distance from the range midpoint / twice-smoothed high–low range.',
    [plot('smi', 'SMI'), plot('signal', 'Signal', 'line', '#a99a84')],
    (bars, p) => {
      const highs = windowed(bars.map(b => b.high), p.period, values => Math.max(...values));
      const lows = windowed(bars.map(b => b.low), p.period, values => Math.min(...values));
      const smooth = values => availableEMA(availableEMA(values, p.smooth), p.smooth);
      const ranges = smooth(difference(highs, lows));
      const relative = smooth(bars.map((b, i) => highs[i] == null ? null : b.close - (highs[i] + lows[i]) / 2));
      const smi = relative.map((value, i) => ranges[i] > 0 && value != null ? 200 * value / ranges[i] : null);
      return { smi, signal: availableEMA(smi, p.signal) };
    }, { levels: [-40, 0, 40] });

  add('smi_ergodic', 'SMI Ergodic Indicator and Oscillator', 'SMIE', 'momentum',
    [number('fast', 'Fast EMA', 5), number('slow', 'Slow EMA', 20), number('signal', 'Signal EMA', 5)],
    p => p.fast + p.slow + p.signal - 1,
    'Double EMA of close changes divided by double EMA of absolute changes. Histogram is SMI minus signal.',
    [plot('smi', 'Ergodic SMI'), plot('signal', 'Signal', 'line', '#a99a84'), plot('hist', 'Oscillator', 'histogram')],
    (bars, p) => {
      const changes = bars.map((b, i) => i ? b.close - bars[i - 1].close : null);
      const smooth = values => availableEMA(availableEMA(values, p.fast), p.slow);
      const numerator = smooth(changes);
      const denominator = smooth(changes.map(value => value == null ? null : Math.abs(value)));
      const smi = numerator.map((value, i) => denominator[i] > 0 && value != null ? value / denominator[i] : null);
      const signal = availableEMA(smi, p.signal);
      return { smi, signal, hist: difference(smi, signal) };
    }, zero);

  const guppyPeriods = [3, 5, 8, 10, 12, 15, 30, 35, 40, 45, 50, 60];
  add('guppy_ma', 'Guppy Multiple Moving Average', 'GMMA', 'overlay', [], () => 60,
    'Twelve closing-price EMAs. Fast periods 3–15 and slow periods 30–60.',
    guppyPeriods.map(length => plot('ema' + length, 'EMA ' + length, 'line', length <= 15 ? '#c6a66b' : '#a99a84')),
    bars => {
      const prices = closes(bars);
      return Object.fromEntries(guppyPeriods.map(length => ['ema' + length, ema(prices, length)]));
    });

  add('moving_average_channel', 'Moving Average Channel', 'MA Channel', 'overlay', [period(20)], p => p.period,
    'Simple moving averages of highs, closes, and lows.',
    [plot('upper', 'High SMA'), plot('middle', 'Close SMA', 'line', '#a99a84'), plot('lower', 'Low SMA')],
    (bars, p) => ({
      upper: sma(bars.map(b => b.high), p.period), middle: sma(closes(bars), p.period), lower: sma(bars.map(b => b.low), p.period),
    }));

  add('williams_alligator', 'Williams Alligator', 'Alligator', 'overlay', [
    number('jaw', 'Jaw period', 13), number('teeth', 'Teeth period', 8), number('lips', 'Lips period', 5),
    number('jawOffset', 'Jaw displacement', 8, 0, 50),
    number('teethOffset', 'Teeth displacement', 5, 0, 50), number('lipsOffset', 'Lips displacement', 3, 0, 50),
  ], p => Math.max(p.jaw + p.jawOffset, p.teeth + p.teethOffset, p.lips + p.lipsOffset),
  'Three smoothed averages of median price displaced forward by their settings. Plot ends at the latest bar.',
  [plot('jaw', 'Jaw', 'line', '#a99a84'), plot('teeth', 'Teeth', 'line', '#fb7185'), plot('lips', 'Lips', 'line', '#eac47a')],
  (bars, p) => {
    const median = bars.map(midpoint);
    const shift = (length, offset) => seededRMA(median, length).map((_, i, series) => series[i - offset] ?? null);
    return { jaw: shift(p.jaw, p.jawOffset), teeth: shift(p.teeth, p.teethOffset), lips: shift(p.lips, p.lipsOffset) };
  });

  add('williams_fractals', 'Williams Fractals', 'Fractals', 'overlay', [period(2)], p => 2 * p.period + 1,
    'Marks a strict local high or low only after the required bars on both sides are present.',
    [plot('upper', 'Swing high', 'dots', '#fb7185'), plot('lower', 'Swing low', 'dots', '#eac47a')],
    (bars, p) => {
      const extremes = (key, compare) => bars.map((bar, i) => {
        if (i < p.period || i + p.period >= bars.length) return null;
        const local = bars.slice(i - p.period, i + p.period + 1);
        return local.every((other, j) => j === p.period || compare(bar[key], other[key])) ? bar[key] : null;
      });
      return { upper: extremes('high', (a, b) => a > b), lower: extremes('low', (a, b) => a < b) };
    }, { aliases: ['Williams Fractal'] });

  add('zig_zag', 'Zig Zag', 'Zig Zag', 'overlay', [
    number('legs', 'Pivot legs', 10, 2, 100),
    number('deviation', 'Reversal threshold (%)', 5, 0.1, 100, 0.1),
  ], p => 2 * Math.floor(p.legs / 2) + 1,
  'Connects confirmed highs and lows that meet the reversal threshold. Pivots are drawn on earlier bars after confirmation. The last leg can change.',
  [plot('swing', 'Swing line'), plot('pivot', 'Confirmed pivot', 'dots', '#a99a84')],
  (bars, p) => {
    const radius = Math.floor(p.legs / 2);
    const turns = [];
    for (let i = radius; i + radius < bars.length; i++) {
      const left = bars.slice(i - radius, i);
      const right = bars.slice(i + 1, i + radius + 1);
      const bar = bars[i];
      const high = left.every(other => bar.high > other.high) && right.every(other => bar.high >= other.high);
      const low = left.every(other => bar.low < other.low) && right.every(other => bar.low <= other.low);
      if (high === low) continue;
      const price = high ? bar.high : bar.low;
      const last = turns.at(-1);
      if (!last) turns.push({ i, high, price });
      else if (last.high === high) {
        if (high ? price > last.price : price < last.price) turns[turns.length - 1] = { i, high, price };
      } else {
        const reversal = high ? price - last.price : last.price - price;
        if (reversal > 0 && Math.abs(last.price) > 0 && 100 * reversal / Math.abs(last.price) >= p.deviation) {
          turns.push({ i, high, price });
        }
      }
    }
    const swing = Array(bars.length).fill(null);
    const pivot = Array(bars.length).fill(null);
    turns.forEach((turn, index) => {
      pivot[turn.i] = turn.price;
      if (!index) return;
      const previous = turns[index - 1];
      const length = turn.i - previous.i;
      for (let i = previous.i; i <= turn.i; i++) {
        swing[i] = previous.price + (turn.price - previous.price) * (i - previous.i) / length;
      }
    });
    return { swing, pivot };
  }, { aliases: ['Zigzag'] });

  add('chande_kroll_stop', 'Chande Kroll Stop', 'CKS', 'overlay',
    [period(10), number('stop', 'Stop lookback', 9), number('factor', 'ATR multiplier', 1, 0.1, 20, 0.1)],
    p => p.period + p.stop - 1,
    'Initial stops are highest high − ATR × factor and lowest low + ATR × factor. Take their rolling maximum and minimum.',
    [plot('long', 'Long stop'), plot('short', 'Short stop', 'line', '#a99a84')],
    (bars, p) => {
      const atr = seededRMA(trueRange(bars), p.period);
      const high = windowed(bars.map(b => b.high), p.period, values => Math.max(...values));
      const low = windowed(bars.map(b => b.low), p.period, values => Math.min(...values));
      const firstLong = high.map((value, i) => value == null ? null : value - atr[i] * p.factor);
      const firstShort = low.map((value, i) => value == null ? null : value + atr[i] * p.factor);
      return {
        long: windowed(firstLong, p.stop, values => Math.max(...values)),
        short: windowed(firstShort, p.stop, values => Math.min(...values)),
      };
    });

  for (const [id, name, fastMA, slowMA] of [
    ['sma_cross', 'MA Cross', sma, sma],
    ['ema_cross', 'EMA Cross', ema, ema],
    ['ma_ema_cross', 'MA with EMA Cross', sma, ema],
  ]) {
    add(id, name, name, 'overlay', [number('fast', 'Fast period', 9), number('slow', 'Slow period', 26)],
      p => Math.max(p.fast, p.slow), 'Two closing-price averages with dots where they cross.',
      [plot('fast', 'Fast'), plot('slow', 'Slow', 'line', '#a99a84'), plot('cross', 'Cross', 'dots', '#fb7185')],
      (bars, p) => {
        const prices = closes(bars);
        const fast = fastMA(prices, p.fast);
        const slow = slowMA(prices, p.slow);
        const spread = difference(fast, slow);
        const cross = spread.map((value, i) => {
          const previous = spread[i - 1];
          if (value == null || previous == null) return null;
          return (value > 0 && previous <= 0) || (value < 0 && previous >= 0) ? fast[i] : null;
        });
        return { fast, slow, cross };
      }, { availability: (_bars, p) => p.fast >= p.slow ? 'Fast period must be shorter than slow period' : '' });
  }

  line('kaufman_efficiency_ratio', 'Kaufman Efficiency Ratio', 'KER', 'trend', [period(10)], p => p.period + 1,
    'Absolute net close movement divided by the sum of absolute bar-to-bar movements. Range: 0 to 1.',
    (bars, p) => windowed(closes(bars), p.period + 1, values => {
      const travel = sum(values.slice(1).map((value, i) => Math.abs(value - values[i])));
      return travel ? Math.abs(values.at(-1) - values[0]) / travel : 0;
    }), { levels: [0, 0.5, 1] });

  line('ulcer_index', 'Ulcer Index', 'UI', 'volatility', [period(14, 2)], p => p.period,
    'Root mean square of percentage drawdowns from each rolling lookback high. Lower values indicate shallower recent drawdowns.',
    (bars, p) => {
      const drawdowns = bars.map((bar, i) => {
        const start = Math.max(0, i - p.period + 1);
        const peak = Math.max(...bars.slice(start, i + 1).map(item => item.close));
        return peak > 0 ? 100 * (bar.close - peak) / peak : null;
      });
      return windowed(drawdowns, p.period, values => Math.sqrt(sum(values.map(value => value ** 2)) / values.length));
    });

  line('vertical_horizontal_filter', 'Vertical Horizontal Filter', 'VHF', 'trend', [period(28, 2)], p => p.period + 1,
    'Absolute close change over the lookback divided by total absolute close movement.',
    (bars, p) => windowed(closes(bars), p.period + 1, values => {
      const path = sum(values.slice(1).map((value, i) => Math.abs(value - values[i])));
      return path ? Math.abs(values.at(-1) - values[0]) / path : 0;
    }));

  line('disparity_index', 'Disparity Index', 'DI', 'momentum', [period(14)], p => p.period,
    'Percentage distance of the close from its simple moving average.',
    (bars, p) => {
      const prices = closes(bars);
      const average = sma(prices, p.period);
      return prices.map((price, i) => average[i] > 0 ? 100 * (price - average[i]) / average[i] : null);
    }, zero);

  line('qstick', 'Qstick', 'Qstick', 'momentum', [period(14)], p => p.period,
    'Simple moving average of candle close minus open.',
    (bars, p) => sma(bars.map(bar => bar.close - bar.open), p.period), zero);

  line('gopalakrishnan_range_index', 'Gopalakrishnan Range Index', 'GAPO', 'volatility', [period(14, 2)], p => p.period,
    'Logarithm of the lookback high-low range divided by logarithm of the lookback length.',
    (bars, p) => bars.map((_, i) => {
      if (i + 1 < p.period) return null;
      const window = bars.slice(i + 1 - p.period, i + 1);
      const range = Math.max(...window.map(bar => bar.high)) - Math.min(...window.map(bar => bar.low));
      return range > 0 ? Math.log(range) / Math.log(p.period) : 0;
    }));

  line('relative_momentum_index', 'Relative Momentum Index', 'RMI', 'momentum',
    [number('momentum', 'Momentum lookback', 5, 1, 100), number('period', 'RSI smoothing period', 20, 2, 100)],
    p => p.momentum + p.period,
    'Wilder RSI applied to close changes measured over the selected momentum lookback.',
    (bars, p) => {
      const prices = closes(bars);
      const changes = prices.map((price, i) => i >= p.momentum ? price - prices[i - p.momentum] : null);
      const gains = seededRMA(changes.map(value => value == null ? null : Math.max(value, 0)), p.period);
      const losses = seededRMA(changes.map(value => value == null ? null : Math.max(-value, 0)), p.period);
      return gains.map((gain, i) => gain == null ? null
        : losses[i] === 0 ? (gain === 0 ? 50 : 100) : 100 * gain / (gain + losses[i]));
    }, { levels: [30, 50, 70] });

  line('schaff_trend_cycle', 'Schaff Trend Cycle', 'STC', 'momentum',
    [number('fast', 'Fast EMA period', 23), number('slow', 'Slow EMA period', 50), period(10, 2), number('smooth', 'Smoothing EMA period', 3, 1, 20)],
    p => p.slow + p.period * 2 + p.smooth * 2,
    'Double-smoothed stochastic of the fast-minus-slow EMA spread. Uses a 0–100 scale.',
    (bars, p) => {
      const spread = difference(ema(closes(bars), p.fast), ema(closes(bars), p.slow));
      const stochastic = values => windowed(values, p.period, slice => {
        const low = Math.min(...slice), high = Math.max(...slice);
        return high === low ? 0 : 100 * (slice.at(-1) - low) / (high - low);
      });
      const first = availableEMA(stochastic(spread), p.smooth);
      return availableEMA(stochastic(first), p.smooth);
    }, { levels: [25, 50, 75] });

  line('center_of_gravity', 'Center of Gravity', 'COG', 'momentum', [period(10, 2)], p => p.period,
    'Negative weighted price sum divided by the unweighted price sum over the lookback.',
    (bars, p) => windowed(closes(bars), p.period, values => {
      const denominator = sum(values);
      return denominator ? -sum(values.map((value, i) => (i + 1) * value)) / denominator : null;
    }), zero);

  add('elder_impulse_system', 'Elder Impulse System', 'Impulse', 'overlay', [], () => 34,
    'Classifies each bar using the slope of EMA 13 and the direction of the MACD histogram (12, 26, 9).',
    [plot('bullish', 'Bullish impulse', 'dots', '#10b981'), plot('bearish', 'Bearish impulse', 'dots', '#ef4444'), plot('neutral', 'Neutral impulse', 'dots', '#94a3b8')],
    bars => {
      const prices = closes(bars);
      const average = ema(prices, 13);
      const macd = difference(ema(prices, 12), ema(prices, 26));
      const signal = availableEMA(macd, 9);
      const histogram = difference(macd, signal);
      const bullish = [], bearish = [], neutral = [];
      bars.forEach((bar, i) => {
        if (i === 0 || average[i] == null || average[i - 1] == null || histogram[i] == null || histogram[i - 1] == null) {
          bullish.push(null); bearish.push(null); neutral.push(null); return;
        }
        const risingAverage = average[i] > average[i - 1];
        const risingHistogram = histogram[i] > histogram[i - 1];
        const isBullish = risingAverage && risingHistogram;
        const isBearish = !risingAverage && !risingHistogram;
        bullish.push(isBullish ? bar.close : null);
        bearish.push(isBearish ? bar.close : null);
        neutral.push(!isBullish && !isBearish ? bar.close : null);
      });
      return { bullish, bearish, neutral };
    });

  line('adr', 'Average Daily Range', 'ADR', 'volatility', [period(14)], p => p.period,
    'Average high-low range of the loaded bars. Use a daily chart for a daily range.',
    (bars, p) => sma(bars.map(bar => bar.high - bar.low), p.period));

  add('bbtrend', 'BBTrend', 'BBTrend', 'momentum', [
    number('shortPeriod', 'Short Bollinger period', 20, 2), number('longPeriod', 'Long Bollinger period', 50, 2),
    number('stdDev', 'Standard deviation', 2, 0.1, 10, 0.1),
  ], p => Math.max(p.shortPeriod, p.longPeriod),
  'Difference between the short and long Bollinger band widths, normalized by the short middle band. Positive values indicate a bullish reading.',
  [plot('value', 'BBTrend', 'histogram')],
  (bars, p) => {
    const prices = closes(bars);
    const bands = length => {
      const middle = sma(prices, length);
      const deviation = windowed(prices, length, values => {
        const mean = sum(values) / values.length;
        return Math.sqrt(sum(values.map(value => (value - mean) ** 2)) / values.length);
      });
      return {
        middle,
        upper: middle.map((value, i) => value == null ? null : value + p.stdDev * deviation[i]),
        lower: middle.map((value, i) => value == null ? null : value - p.stdDev * deviation[i]),
      };
    };
    const short = bands(p.shortPeriod);
    const long = bands(p.longPeriod);
    return { value: short.middle.map((middle, i) => middle > 0 && short.lower[i] != null && long.lower[i] != null
      ? (Math.abs(short.lower[i] - long.lower[i]) - Math.abs(short.upper[i] - long.upper[i])) / middle * 100 : null) };
  }, { levels: [0], availability: (_bars, p) => p.shortPeriod >= p.longPeriod ? 'Short period must be shorter than long period' : '' });

  add('up_down_volume', 'Up/Down Volume', 'Up/Down Vol', 'volume', [], () => 2,
    'Bar volume classified as up or down by close versus the previous close. This is not bid/ask volume delta.',
    [plot('up', 'Up volume', 'histogram', '#10b981'), plot('down', 'Down volume', 'histogram', '#ef4444')],
    bars => ({
      up: bars.map((bar, i) => i && Number.isFinite(bar.volume) && bar.close >= bars[i - 1].close ? bar.volume : null),
      down: bars.map((bar, i) => i && Number.isFinite(bar.volume) && bar.close < bars[i - 1].close ? -bar.volume : null),
    }), { needsVolume: true });

  add('volume_delta_estimate', 'Candle-Signed Volume Delta Estimate', 'Vol Delta Est', 'volume', [], () => 1,
    'Estimated signed volume: positive when a candle closes above its open, negative below. OHLCV bars do not contain aggressor-side trade data.',
    [plot('delta', 'Estimated delta', 'histogram')],
    bars => ({ delta: bars.map(bar => Number.isFinite(bar.volume) ? Math.sign(bar.close - bar.open) * bar.volume : null) }),
    { needsVolume: true, aliases: ['Estimated Volume Delta'] });

  line('cumulative_volume_delta_estimate', 'Cumulative Volume Delta Estimate', 'CVD Est', 'volume', [], () => 1,
    'Cumulative candle-signed volume estimate using close versus open. This is not trade-level bid/ask CVD.',
    bars => {
      let cumulative = 0;
      return bars.map(bar => {
        if (!Number.isFinite(bar.volume)) return null;
        cumulative += Math.sign(bar.close - bar.open) * bar.volume;
        return cumulative;
      });
    }, { needsVolume: true, aliases: ['Estimated Cumulative Volume Delta'] });

  const pivotParams = [];
  const pivotPlotSet = (prefix = '') => [
    plot(prefix + 'p', 'Pivot'), plot(prefix + 'r1', 'R1', 'line', '#fb7185'), plot(prefix + 's1', 'S1', 'line', '#10b981'),
    plot(prefix + 'r2', 'R2', 'line', '#fb7185'), plot(prefix + 's2', 'S2', 'line', '#10b981'),
  ];
  const pivotStudy = (id, name, formula, calculate, extra = false) => add(id, name, name, 'overlay', pivotParams,
    () => 2, `${formula} Uses the previous loaded bar as its reference; use daily candles for session-style pivots.`,
    extra ? [plot('p', 'Pivot'), plot('r1', 'R1', 'line', '#fb7185'), plot('s1', 'S1', 'line', '#10b981')] : pivotPlotSet(), bars => {
      const values = Object.fromEntries(['p', 'r1', 's1', 'r2', 's2'].map(key => [key, Array(bars.length).fill(null)]));
      for (let i = 1; i < bars.length; i++) {
        const current = bars[i - 1];
        Object.assign(values, calculate(current, values, i));
      }
      return values;
    }, { aliases: extra ? ['Pivot Points DM'] : [] });

  pivotStudy('pivots_fibonacci', 'Pivot Points (Fibonacci)',
    'P = (H + L + C) / 3; support and resistance offsets use 0.382, 0.618, and 1.000 × the prior bar range.',
    (bar, values, i) => {
      const p = (bar.high + bar.low + bar.close) / 3, range = bar.high - bar.low;
      values.p[i] = p;
      values.r1[i] = p + 0.382 * range; values.s1[i] = p - 0.382 * range;
      values.r2[i] = p + 0.618 * range; values.s2[i] = p - 0.618 * range;
      return values;
    });

  pivotStudy('pivots_woodie', 'Pivot Points (Woodie)',
    'P = (H + L + 2C) / 4; first and second levels use traditional range formulas.',
    (bar, values, i) => {
      const p = (bar.high + bar.low + 2 * bar.close) / 4, range = bar.high - bar.low;
      values.p[i] = p;
      values.r1[i] = 2 * p - bar.low; values.s1[i] = 2 * p - bar.high;
      values.r2[i] = p + range; values.s2[i] = p - range;
      return values;
    });

  pivotStudy('pivots_camarilla', 'Pivot Points (Camarilla)',
    'P = (H + L + C) / 3; levels use close ± prior bar range × 1.1 / 12, 6, 4, and 2.',
    (bar, values, i) => {
      const p = (bar.high + bar.low + bar.close) / 3, range = bar.high - bar.low;
      values.p[i] = p;
      values.r1[i] = bar.close + range * 1.1 / 12; values.s1[i] = bar.close - range * 1.1 / 12;
      values.r2[i] = bar.close + range * 1.1 / 6; values.s2[i] = bar.close - range * 1.1 / 6;
      return values;
    });

  pivotStudy('pivots_dm', 'Pivot Points (DeMark)',
    'DeMark X depends on prior close versus open; P = X / 4, R1 = X / 2 − L, S1 = X / 2 − H.',
    (bar, values, i) => {
      const x = bar.close < bar.open ? bar.high + 2 * bar.low + bar.close
        : bar.close > bar.open ? 2 * bar.high + bar.low + bar.close : bar.high + bar.low + 2 * bar.close;
      values.p[i] = x / 4; values.r1[i] = x / 2 - bar.low; values.s1[i] = x / 2 - bar.high;
      values.r2[i] = null; values.s2[i] = null;
      return values;
    }, true);

  add('auto_trendlines', 'Auto Trendlines', 'Auto TL', 'overlay', [period(3, 2)], p => 2 * p.period + 2,
    'Joins the latest two confirmed swing highs and lows. The current segment extends to the latest bar and can change when a new swing confirms.',
    [plot('resistance', 'Swing-high line', 'line', '#fb7185'), plot('support', 'Swing-low line', 'line', '#10b981')],
    (bars, p) => {
      const highs = [], lows = [];
      const resistance = Array(bars.length).fill(null), support = Array(bars.length).fill(null);
      const radius = p.period;
      const isPivot = (index, key, direction) => {
        const pivot = bars[index][key];
        for (let j = index - radius; j <= index + radius; j++) {
          if (j === index) continue;
          if (direction === 'high' ? bars[j][key] > pivot : bars[j][key] < pivot) return false;
        }
        return true;
      };
      for (let i = 0; i < bars.length; i++) {
        const confirmed = i - radius;
        if (confirmed >= radius && confirmed + radius < bars.length) {
          if (isPivot(confirmed, 'high', 'high')) highs.push({ i: confirmed, value: bars[confirmed].high });
          if (isPivot(confirmed, 'low', 'low')) lows.push({ i: confirmed, value: bars[confirmed].low });
        }
        const project = (points, output) => {
          if (points.length < 2) return;
          const a = points.at(-2), b = points.at(-1);
          output[i] = b.value + (b.value - a.value) * (i - b.i) / (b.i - a.i);
        };
        project(highs, resistance); project(lows, support);
      }
      return { resistance, support };
    });

  add('auto_fib_extension', 'Auto Fibonacci Extension', 'Auto Fib Ext', 'overlay', [period(3, 2)], p => 3 * p.period + 3,
    'Projects 0.382, 0.618, 1.000, 1.272, 1.618, and 2.618 extensions from the latest three alternating confirmed swing pivots. Levels update as pivots confirm.',
    [plot('level0', '0.000', 'line', '#94a3b8'), plot('level382', '0.382'), plot('level618', '0.618'),
      plot('level1000', '1.000', 'line', '#e8b34e'), plot('level1272', '1.272'), plot('level1618', '1.618'), plot('level2618', '2.618')],
    (bars, p) => {
      const names = ['level0', 'level382', 'level618', 'level1000', 'level1272', 'level1618', 'level2618'];
      const ratios = [0, 0.382, 0.618, 1, 1.272, 1.618, 2.618];
      const output = Object.fromEntries(names.map(name => [name, Array(bars.length).fill(null)]));
      const turns = [];
      const radius = p.period;
      const pivotAt = index => {
        const bar = bars[index];
        const high = bars.slice(index - radius, index).every(other => bar.high >= other.high)
          && bars.slice(index + 1, index + radius + 1).every(other => bar.high > other.high);
        const low = bars.slice(index - radius, index).every(other => bar.low <= other.low)
          && bars.slice(index + 1, index + radius + 1).every(other => bar.low < other.low);
        return high === low ? null : { index, high, value: high ? bar.high : bar.low };
      };
      for (let i = 0; i < bars.length; i++) {
        const confirmed = i - radius;
        if (confirmed >= radius && confirmed + radius < bars.length) {
          const pivot = pivotAt(confirmed);
          if (pivot && turns.at(-1)?.high !== pivot.high) turns.push(pivot);
          else if (pivot && turns.at(-1)?.high === pivot.high
            && (pivot.high ? pivot.value > turns.at(-1).value : pivot.value < turns.at(-1).value)) turns[turns.length - 1] = pivot;
        }
        if (turns.length < 3) continue;
        const [a, b, c] = turns.slice(-3);
        const swing = b.value - a.value;
        const levels = [c.value, ...ratios.slice(1).map(ratio => c.value + swing * ratio)];
        names.forEach((name, index) => { output[name][i] = levels[index]; });
      }
      return output;
    });

  add('auto_fib_retracement', 'Auto Fibonacci Retracement', 'Auto Fib', 'overlay', [period(3, 2)], p => 2 * p.period + 2,
    'Retracement levels between the latest two confirmed alternating swing pivots. Levels update as pivots confirm.',
    [plot('level0', '0.000', 'line', '#94a3b8'), plot('level236', '0.236'), plot('level382', '0.382'),
      plot('level500', '0.500', 'line', '#e8b34e'), plot('level618', '0.618'), plot('level786', '0.786'), plot('level1000', '1.000', 'line', '#94a3b8')],
    (bars, p) => {
      const names = ['level0', 'level236', 'level382', 'level500', 'level618', 'level786', 'level1000'];
      const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const output = Object.fromEntries(names.map(name => [name, Array(bars.length).fill(null)]));
      const turns = [];
      const radius = p.period;
      for (let i = 0; i < bars.length; i++) {
        const pivotIndex = i - radius;
        if (pivotIndex >= radius && pivotIndex + radius < bars.length) {
          const pivot = bars[pivotIndex];
          const left = bars.slice(pivotIndex - radius, pivotIndex);
          const right = bars.slice(pivotIndex + 1, pivotIndex + radius + 1);
          const high = left.every(bar => pivot.high >= bar.high) && right.every(bar => pivot.high > bar.high);
          const low = left.every(bar => pivot.low <= bar.low) && right.every(bar => pivot.low < bar.low);
          if (high !== low) {
            const next = { high, value: high ? pivot.high : pivot.low };
            if (turns.at(-1)?.high !== high) turns.push(next);
            else if (high ? next.value > turns.at(-1).value : next.value < turns.at(-1).value) turns[turns.length - 1] = next;
          }
        }
        if (turns.length < 2) continue;
        const [a, b] = turns.slice(-2);
        const range = b.value - a.value;
        const levels = ratios.map(ratio => b.value - range * ratio);
        names.forEach((name, index) => { output[name][i] = levels[index]; });
      }
      return output;
    });

  add('auto_pitchfork', 'Auto Pitchfork', 'Pitchfork', 'overlay', [period(3, 2)], p => 3 * p.period + 3,
    'Andrews pitchfork from the latest three alternating confirmed pivots. Median and parallel outer lines extend to the latest bar.',
    [plot('median', 'Median line', 'line', '#e8b34e'), plot('upper', 'Upper parallel', 'line', '#fb7185'), plot('lower', 'Lower parallel', 'line', '#10b981')],
    (bars, p) => {
      const output = { median: Array(bars.length).fill(null), upper: Array(bars.length).fill(null), lower: Array(bars.length).fill(null) };
      const turns = [];
      const radius = p.period;
      for (let i = 0; i < bars.length; i++) {
        const pivotIndex = i - radius;
        if (pivotIndex >= radius) {
          const pivot = bars[pivotIndex];
          const left = bars.slice(pivotIndex - radius, pivotIndex);
          const right = bars.slice(pivotIndex + 1, pivotIndex + radius + 1);
          const high = left.every(bar => pivot.high >= bar.high) && right.every(bar => pivot.high > bar.high);
          const low = left.every(bar => pivot.low <= bar.low) && right.every(bar => pivot.low < bar.low);
          if (high !== low) {
            const point = { index: pivotIndex, high, value: high ? pivot.high : pivot.low };
            if (turns.at(-1)?.high !== high) turns.push(point);
            else if (high ? point.value > turns.at(-1).value : point.value < turns.at(-1).value) turns[turns.length - 1] = point;
          }
        }
        if (turns.length < 3) continue;
        const [a, b, c] = turns.slice(-3);
        const midpoint = { index: (b.index + c.index) / 2, value: (b.value + c.value) / 2 };
        const slope = (midpoint.value - a.value) / (midpoint.index - a.index);
        output.median[i] = a.value + slope * (i - a.index);
        const upperOffset = b.value - (a.value + slope * (b.index - a.index));
        const lowerOffset = c.value - (a.value + slope * (c.index - a.index));
        output.upper[i] = output.median[i] + upperOffset;
        output.lower[i] = output.median[i] + lowerOffset;
      }
      return output;
    });

  add('auto_key_levels', 'Auto Key Levels', 'Key Levels', 'overlay', [
    number('lookback', 'Lookback bars', 200, 20, 500), number('swing', 'Pivot bars each side', 3, 1, 20),
    number('tolerance', 'Cluster tolerance (%)', 0.5, 0.05, 5, 0.05),
  ], p => p.lookback,
  'Ranks recent confirmed swing prices by nearby retests and plots the three strongest support and resistance clusters. Calculated from loaded bars.',
  [plot('resistance1', 'Resistance 1', 'line', '#fb7185'), plot('resistance2', 'Resistance 2', 'line', '#fb7185'),
    plot('resistance3', 'Resistance 3', 'line', '#fb7185'), plot('support1', 'Support 1', 'line', '#10b981'),
    plot('support2', 'Support 2', 'line', '#10b981'), plot('support3', 'Support 3', 'line', '#10b981')],
  (bars, p) => {
    const names = ['resistance1', 'resistance2', 'resistance3', 'support1', 'support2', 'support3'];
    const output = Object.fromEntries(names.map(name => [name, Array(bars.length).fill(null)]));
    const radius = p.swing;
    for (let i = 0; i < bars.length; i++) {
      const candidates = [];
      const start = Math.max(radius, i - p.lookback + 1);
      const end = i - radius;
      for (let j = start; j <= end; j++) {
        const window = bars.slice(j - radius, j + radius + 1);
        if (window.every((bar, offset) => offset === radius || bar.high < bars[j].high)) candidates.push({ value: bars[j].high, type: 'resistance' });
        if (window.every((bar, offset) => offset === radius || bar.low > bars[j].low)) candidates.push({ value: bars[j].low, type: 'support' });
      }
      const tolerance = Math.abs(bars[i].close) * p.tolerance / 100;
      for (const type of ['resistance', 'support']) {
        const clusters = [];
        for (const candidate of candidates.filter(item => item.type === type)) {
          const cluster = clusters.find(item => Math.abs(item.value - candidate.value) <= tolerance);
          if (cluster) {
            cluster.value = (cluster.value * cluster.count + candidate.value) / (cluster.count + 1);
            cluster.count++;
          } else clusters.push({ value: candidate.value, count: 1 });
        }
        const ranked = clusters.filter(item => type === 'resistance' ? item.value >= bars[i].close : item.value <= bars[i].close)
          .sort((a, b) => b.count - a.count || (type === 'resistance' ? a.value - b.value : b.value - a.value)).slice(0, 3);
        ranked.forEach((cluster, index) => {
          const key = `${type}${index + 1}`;
          if (output[key]) output[key][i] = cluster.value;
        });
      }
    }
    return output;
  });

  return catalog;
}
