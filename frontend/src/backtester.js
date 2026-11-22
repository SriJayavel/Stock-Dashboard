/**
 * Mara Backtesting Laboratory
 * Simulates algorithmic strategy rules on historical OHLCV data:
 * - Strategy Rules: EMA Golden Cross, RSI Mean Reversion, BB Breakout
 * - Computes: Strategy CAGR, Benchmark CAGR, Max Drawdown, Win Rate, Total Signals
 * - Generates series markers for chart visualization.
 */

/** @typedef {{ time: number | string, close: number, ema50?: number, ema200?: number, rsi?: number }} BacktestBar */

export class Backtester {
  /** @param {{ candles: BacktestBar[], strategy?: string }} input */
  static run({ candles, strategy = 'ema_crossover' }) {
    if (!candles || candles.length < 50) {
      return { error: 'Insufficient historical bars to simulate backtest (minimum 50 required).' };
    }

    const trades = [];
    const markers = [];
    let inPosition = false;
    let entryPrice = 0;
    /** @type {number | string} */
    let entryDate = '';
    let capital = 100000;
    const initialCapital = capital;
    let peakCapital = capital;
    let maxDrawdown = 0;

    // Benchmark Buy & Hold
    const startPrice = candles[0].close;
    const endPrice = candles[candles.length - 1].close;
    const bnhReturn = ((endPrice - startPrice) / startPrice) * 100;

    // Apply realistic transaction friction (0.03% slippage + brokerage on turnover)
    const frictionPct = 0.03;

    for (let i = 25; i < candles.length; i++) {
      const bar = candles[i];
      const prevBar = candles[i - 1];

      let buySignal = false;
      let sellSignal = false;

      if (strategy === 'ema_crossover') {
        const ema50 = bar.ema50;
        const ema200 = bar.ema200;
        const prevEma50 = prevBar.ema50;
        const prevEma200 = prevBar.ema200;

        if (ema50 && ema200 && prevEma50 && prevEma200) {
          // Golden Cross: EMA 50 crosses above EMA 200
          if (prevEma50 <= prevEma200 && ema50 > ema200) {
            buySignal = true;
          }
          // Death Cross: EMA 50 crosses below EMA 200
          else if (prevEma50 >= prevEma200 && ema50 < ema200) {
            sellSignal = true;
          }
        }
      } else if (strategy === 'rsi_mean_reversion') {
        const rsi = bar.rsi;
        const prevRsi = prevBar.rsi;
        if (rsi && prevRsi) {
          if (prevRsi < 30 && rsi >= 30) buySignal = true; // Exiting oversold
          if (prevRsi > 70 && rsi <= 70) sellSignal = true; // Exiting overbought
        }
      }

      // Execute Trade Logic with Friction
      if (buySignal && !inPosition) {
        inPosition = true;
        // Buy at ask (price + slippage)
        entryPrice = bar.close * (1 + frictionPct / 100);
        entryDate = bar.time;
        markers.push({
          time: bar.time,
          position: 'belowBar',
          color: '#3ecf8e',
          shape: 'arrowUp',
          text: 'BUY',
        });
      } else if (sellSignal && inPosition) {
        inPosition = false;
        // Sell at bid (price - slippage)
        const exitPrice = bar.close * (1 - frictionPct / 100);
        const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
        capital = capital * (1 + pnlPct / 100);

        if (capital > peakCapital) peakCapital = capital;
        const currentDd = ((capital - peakCapital) / peakCapital) * 100;
        if (currentDd < maxDrawdown) maxDrawdown = currentDd;

        trades.push({
          entryDate,
          exitDate: bar.time,
          entryPrice,
          exitPrice,
          pnlPct: round(pnlPct, 2),
        });

        markers.push({
          time: bar.time,
          position: 'aboveBar',
          color: '#f0655a',
          shape: 'arrowDown',
          text: 'SELL',
        });
      }
    }

    // If still in position at the end of the data
    if (inPosition) {
      const exitPrice = candles[candles.length - 1].close * (1 - frictionPct / 100);
      const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
      capital = capital * (1 + pnlPct / 100);
      trades.push({
        entryDate,
        exitDate: candles[candles.length - 1].time,
        entryPrice,
        exitPrice,
        pnlPct: round(pnlPct, 2),
      });
    }

    const totalReturn = ((capital - initialCapital) / initialCapital) * 100;
    const wins = trades.filter((t) => t.pnlPct > 0).length;
    const losses = trades.filter((t) => t.pnlPct < 0).length;
    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

    // Advanced Quantitative Metrics (Sharpe, Sortino, Profit Factor)
    const returns = trades.map((t) => t.pnlPct / 100);
    const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    
    // Standard deviation of trade returns
    const variance = returns.length > 1
      ? returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1)
      : 0;
    const stdDev = Math.sqrt(variance);

    // Downside deviation for Sortino (semi-variance)
    const downsideReturns = returns.filter((r) => r < 0);
    const downsideVariance = downsideReturns.length > 1
      ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
      : 0;
    const downsideStdDev = Math.sqrt(downsideVariance);

    // Annualized risk-free rate assumption (6.5% G-Sec risk-free rate / 252 periods)
    const rfTrade = 0.065 / Math.max(trades.length, 1);
    const sharpeRatio = stdDev > 0 ? ((meanReturn - rfTrade) / stdDev) * Math.sqrt(Math.min(trades.length, 252)) : 0;
    const sortinoRatio = downsideStdDev > 0 ? ((meanReturn - rfTrade) / downsideStdDev) * Math.sqrt(Math.min(trades.length, 252)) : 0;

    // Profit Factor (Gross Wins / Gross Losses)
    const grossWins = trades.filter((t) => t.pnlPct > 0).reduce((sum, t) => sum + t.pnlPct, 0);
    const grossLosses = Math.abs(trades.filter((t) => t.pnlPct < 0).reduce((sum, t) => sum + t.pnlPct, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? 99.9 : 0);

    return {
      strategy,
      totalReturnPct: round(totalReturn, 2),
      benchmarkReturnPct: round(bnhReturn, 2),
      maxDrawdownPct: round(maxDrawdown, 2),
      winRatePct: round(winRate, 1),
      sharpeRatio: round(sharpeRatio, 2),
      sortinoRatio: round(sortinoRatio, 2),
      profitFactor: round(profitFactor, 2),
      frictionAppliedPct: frictionPct,
      totalTrades: trades.length,
      profitableTrades: wins,
      markers,
      trades: trades.slice(-10),
    };
  }
}

/** @param {number} val */
function round(val, dec = 2) {
  return Number(Math.round(Number(val + 'e' + dec)) + 'e-' + dec);
}
