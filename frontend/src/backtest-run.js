import { api, isDemoMode } from './api.js';
import { Backtester } from './backtester.js';

let currentRun;
const element = id => document.getElementById(`backtest-${id}`);
const atBottom = trace => trace.scrollHeight - trace.scrollTop - trace.clientHeight < 8;

export function setupBacktestTrace() {
  const trace = element('trace');
  const latest = element('latest');
  trace.addEventListener('scroll', () => { latest.hidden = atBottom(trace); });
  latest.addEventListener('click', () => {
    trace.scrollTop = trace.scrollHeight;
    trace.focus({ preventScroll: true });
  });
  element('cancel').addEventListener('click', () => cancelBacktest());
}

export function cancelBacktest(reset = false) {
  if (currentRun) {
    currentRun.controller.abort();
    currentRun.finish('Cancelled');
    currentRun = undefined;
  }
  if (reset) {
    element('run').hidden = true;
    element('results-container').textContent = 'Run a backtest against daily historical prices.';
  }
}

export async function executeBacktest(symbol, strategy, render) {
  cancelBacktest();
  const trace = element('trace');
  const latest = element('latest');
  const status = element('run-state');
  const elapsed = element('run-time');
  const cancel = element('cancel');
  const results = element('results-container');
  const controller = new AbortController();
  const started = performance.now();
  const tick = () => { elapsed.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`; };
  const timer = setInterval(tick, 100);
  const phase = label => { status.textContent = `${symbol} · ${label}`; };
  const finish = label => {
    clearInterval(timer);
    tick();
    cancel.hidden = true;
    phase(label);
  };
  const run = { controller, finish };
  currentRun = run;
  const active = () => currentRun === run && !controller.signal.aborted;
  let lastStep = started;
  const step = (label, data) => {
    const now = performance.now();
    const follow = atBottom(trace);
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const payload = document.createElement('pre');
    summary.textContent = `${label} · ${((now - lastStep) / 1000).toFixed(1)} s`;
    lastStep = now;
    payload.textContent = JSON.stringify(data, null, 2);
    details.append(summary, payload);
    trace.append(details);
    if (follow) trace.scrollTop = trace.scrollHeight;
    latest.hidden = atBottom(trace);
  };

  trace.replaceChildren();
  results.textContent = isDemoMode() ? 'Demo · Synthetic fixture' : 'Market history';
  latest.hidden = true;
  element('run').hidden = false;
  cancel.hidden = false;
  tick();
  phase('Queued');

  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (!active()) return;
    step('Prepared simulation parameters', { symbol, strategy, timeframe: '1y', interval: '1d' });
    phase('Running tool · Fetching daily history');
    const history = await api.getStockHistory(symbol, '1y', '1d', controller.signal);
    if (!active()) return;
    const source = isDemoMode() ? 'Demo · Synthetic fixture'
      : [history.data_source || 'Market history', history.freshness].filter(Boolean).join(' · ');
    const candles = history.candles || [];
    step('Fetched daily price history', { source, bars: candles.length, asOf: history.last_updated });
    phase('Running tool · Simulating strategy');
    await new Promise(resolve => setTimeout(resolve, 0));
    if (!active()) return;
    const result = Backtester.run({ candles, strategy });
    if (result.error) throw new Error(result.error);
    const { markers, ...output } = result;
    step('Simulated strategy', output);
    render(result);
    const provenance = document.createElement('p');
    provenance.className = 'backtest-source';
    provenance.textContent = `${symbol} · ${source} · ${candles.length} daily bars`;
    results.prepend(provenance);
    finish('Completed');
  } catch (error) {
    if (!active()) return;
    step('Backtest failed', { message: error.message });
    results.textContent = error.message;
    finish('Failed');
  } finally {
    if (currentRun === run) currentRun = undefined;
  }
}
