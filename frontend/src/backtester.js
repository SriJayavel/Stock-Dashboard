/**
 * Mara Backtesting Laboratory
 * Simulates algorithmic strategy rules on historical OHLCV data:
 * - Strategy Rules: EMA Golden Cross, RSI Mean Reversion, BB Breakout
 * - Computes: Strategy CAGR, Benchmark CAGR, Max Drawdown, Win Rate, Total Signals
 * - Generates series markers for chart visualization.
 */

export class Backtester {
  static run({ candles, strategy = 'ema_crossover' }) {
    if (!candles || candles.length < 50) {
      return { error: 'Insufficient historical bars to simulate backtest (minimum 50 required).' };
    }

    const trades = [];
    const markers = [];
    let inPosition = false;
    let entryPrice = 0;
    let entryDate = '';
    let capital = 100000;
    const initialCapital = capital;
    let peakCapital = capital;
    let maxDrawdown = 0;

    // Benchmark Buy & Hold
    const startPrice = candles[0].close;
    const endPrice = candles[candles.length - 1].close;
    const bnhReturn = ((endPrice - startPrice) / startPrice) * 100;

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

      // Execute Trade Logic
      if (buySignal && !inPosition) {
        inPosition = true;
        entryPrice = bar.close;
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
        const exitPrice = bar.close;
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
      const exitPrice = candles[candles.length - 1].close;
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
    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

    return {
      strategy,
      totalReturnPct: round(totalReturn, 2),
      benchmarkReturnPct: round(bnhReturn, 2),
      maxDrawdownPct: round(maxDrawdown, 2),
      winRatePct: round(winRate, 1),
      totalTrades: trades.length,
      profitableTrades: wins,
      markers,
      trades: trades.slice(-10),
    };
  }
}

function round(val, dec = 2) {
  return Number(Math.round(val + 'e' + dec) + 'e-' + dec);
}
