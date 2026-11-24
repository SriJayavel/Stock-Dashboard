import { api, isDemoMode } from './api.js';
import './styles/benchmark-comparison.css';

const isoSession = time => new Date(time * 1000).toISOString().slice(0, 10);
const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const formatDate = date => shortDate.format(new Date(date));
const signed = (value, suffix) => `${value > 0 ? '+' : ''}${value.toFixed(2)}${suffix}`;

export function alignBenchmarkCloses(nifty, sensex) {
  const bySession = candles => new Map(candles
    .filter(bar => Number.isFinite(bar.time) && bar.time > 0 && bar.time < 1e11
      && Number.isFinite(bar.close) && bar.close > 0)
    .map(bar => [isoSession(bar.time), bar.close]));
  const left = bySession(nifty);
  const right = bySession(sensex);
  return [...left.keys()].filter(date => right.has(date)).sort()
    .map(date => ({ date, nifty: left.get(date), sensex: right.get(date) }));
}

export function rebaseBenchmarkCloses(shared, sessions) {
  const window = shared.slice(-sessions);
  const first = window[0];
  return window.map(({ date, nifty, sensex }) => ({
    date,
    nifty: 100 * (nifty / first.nifty - 1),
    sensex: 100 * (sensex / first.sensex - 1),
  }));
}

function drawComparison(canvas, rows, selected) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx || !width || !height) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.scale(ratio, ratio);

  const style = getComputedStyle(canvas);
  const text = style.getPropertyValue('--text-muted').trim();
  const border = style.getPropertyValue('--border').trim();
  const amber = style.getPropertyValue('--accent').trim();
  const ink = style.getPropertyValue('--text').trim();
  const left = 53;
  const right = width - 14;
  const top = 16;
  const bottom = height - 33;
  const values = rows.flatMap(row => [row.nifty, row.sensex, 0]);
  const lowest = Math.min(-0.5, ...values);
  const highest = Math.max(0.5, ...values);
  const scale = 10 ** Math.floor(Math.log10((highest - lowest) / 4));
  const step = [1, 2, 2.5, 5, 10].map(size => size * scale)
    .find(size => size >= (highest - lowest) / 4);
  const lowerTick = Math.floor(lowest / step);
  const upperTick = Math.ceil(highest / step);
  const min = lowerTick * step;
  const max = upperTick * step;
  const x = index => left + (right - left) * index / (rows.length - 1);
  const y = value => bottom - (bottom - top) * (value - min) / (max - min);

  ctx.font = `11px ${style.getPropertyValue('--font-mono')}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillStyle = text;
  for (let i = lowerTick; i <= upperTick; i++) {
    const value = i * step;
    const level = y(value);
    ctx.strokeStyle = i === 0 ? text : border;
    ctx.beginPath();
    ctx.moveTo(left, level);
    ctx.lineTo(right, level);
    ctx.stroke();
    ctx.fillText(String(Number((100 + value).toFixed(2))), left - 7, level);
  }
  ctx.textAlign = 'left';
  ctx.fillText(formatDate(rows[0].date), left, height - 13);
  ctx.textAlign = 'right';
  ctx.fillText(formatDate(rows.at(-1).date), right, height - 13);

  ctx.beginPath();
  ctx.strokeStyle = text;
  ctx.setLineDash([3, 4]);
  ctx.moveTo(x(selected), top);
  ctx.lineTo(x(selected), bottom);
  ctx.stroke();

  for (const [key, color, dash] of [['nifty', amber, []], ['sensex', ink, [6, 4]]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.beginPath();
    rows.forEach((row, index) => {
      if (index === 0) ctx.moveTo(x(index), y(row[key]));
      else ctx.lineTo(x(index), y(row[key]));
    });
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x(selected), y(rows[selected][key]), 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

export function mountBenchmarkComparison(panel) {
  const scope = new AbortController();
  const { signal } = scope;
  const find = id => panel.querySelector(`#pair-${id}`);
  const performance = find('performance');
  const slider = find('session');
  const canvas = find('canvas');
  const buttons = [...panel.querySelectorAll('[data-sessions]')];
  let shared = [];
  let rows = [];
  let sessions = 63;
  let source = '';
  let request;

  function inspect() {
    const index = Number(slider.value);
    const row = rows[index];
    if (!row) return;
    const time = find('date');
    time.dateTime = row.date;
    time.textContent = row.date;
    const nifty = signed(row.nifty, '%');
    const sensex = signed(row.sensex, '%');
    find('nifty-return').textContent = nifty;
    find('sensex-return').textContent = sensex;
    const gap = row.nifty - row.sensex;
    find('gap').textContent = Math.abs(gap) < 0.005
      ? 'Returns are even' : `${gap > 0 ? 'NIFTY 50' : 'SENSEX'} leads by ${Math.abs(gap).toFixed(2)} pp`;
    slider.setAttribute('aria-valuetext', `${row.date}. NIFTY 50 ${nifty}. SENSEX ${sensex}.`);
    drawComparison(canvas, rows, index);
  }

  function renderWindow() {
    rows = rebaseBenchmarkCloses(shared, sessions);
    if (rows.length < 2) return;
    slider.max = String(rows.length - 1);
    slider.value = slider.max;
    find('history-rows').innerHTML = rows.map(row => `<tr><th scope="row">${row.date}</th><td>${signed(row.nifty, '%')}</td><td>${signed(row.sensex, '%')}</td></tr>`).join('');
    find('source').textContent = `${source} · ${rows.length} shared sessions · ${rows[0].date} to ${rows.at(-1).date}`;
    inspect();
  }

  async function load() {
    request?.abort();
    const controller = new AbortController();
    request = controller;
    performance.hidden = true;
    find('state').hidden = false;
    find('retry').hidden = true;
    find('status').textContent = 'Loading daily closes…';
    for (const button of buttons) button.disabled = true;
    try {
      const nifty = await api.getStockHistory('^NSEI', '6mo', '1d', controller.signal);
      controller.signal.throwIfAborted();
      const sensex = await api.getStockHistory('^BSESN', '6mo', '1d', controller.signal);
      controller.signal.throwIfAborted();
      const providers = [...new Set([nifty.data_source, sensex.data_source].filter(Boolean))];
      source = isDemoMode() ? 'Synthetic demo closes' : providers.join(' / ') || 'Daily close data';
      shared = alignBenchmarkCloses(nifty.candles || [], sensex.candles || []);
      if (shared.length < 2) {
        find('status').textContent = 'At least two shared sessions are needed to compare returns.';
        return;
      }
      find('state').hidden = true;
      performance.hidden = false;
      for (const button of buttons) button.disabled = false;
      renderWindow();
    } catch {
      if (controller.signal.aborted) return;
      find('status').textContent = 'Daily closes could not be loaded.';
      find('retry').hidden = false;
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      sessions = Number(button.dataset.sessions);
      for (const option of buttons) option.setAttribute('aria-pressed', String(option === button));
      renderWindow();
    }, { signal });
    button.setAttribute('aria-pressed', String(Number(button.dataset.sessions) === sessions));
  }
  slider.addEventListener('input', inspect, { signal });
  find('retry').addEventListener('click', load, { signal });
  const observer = new ResizeObserver(inspect);
  observer.observe(canvas);
  const theme = new MutationObserver(inspect);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  load();
  return () => {
    request?.abort();
    scope.abort();
    observer.disconnect();
    theme.disconnect();
  };
}
