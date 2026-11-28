import { api, isDemoMode } from './api.js';
import { getAccountStorageKey } from './auth.js';
import { router } from './router.js';
import { escapeHtml } from './provenance.js';

const names = {
  trend: 'Trend line',
  level: 'Price level',
  box: 'Rectangle',
  fib: 'Fibonacci retracement',
  ray: 'Trend ray',
  time: 'Time marker',
};
const singlePoint = new Set(['level', 'time']);
const fibLevels = [0, .236, .382, .5, .618, .786, 1];
const priceLabel = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const fibLabel = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const byId = id => document.getElementById(id);

export class ChartTools {
  constructor(chart) {
    this.chart = chart;
    this.drawings = [];
    this.redoStack = [];
    this.snap = true;
    this.events = [];
    this.panel = byId('chart-tools-panel');
    this.body = byId('chart-tools-body');
    this.hint = byId('chart-drawing-hint');
    this.buttons = [...document.querySelectorAll('[data-chart-drawing]')];
    this.tabs = [...this.panel.querySelectorAll('[data-chart-view]')];
    for (const button of this.buttons) {
      button.addEventListener('click', () => {
        if (!this.chart.currentCandles.length) return;
        this.setMode(this.mode === button.dataset.chartDrawing ? null : button.dataset.chartDrawing);
        if (this.mode) this.chart.canvas.focus({ preventScroll: true });
      });
    }
    byId('chart-snap-btn').addEventListener('click', event => {
      this.snap = !this.snap;
      event.currentTarget.setAttribute('aria-pressed', String(this.snap));
    });
    byId('chart-undo').addEventListener('click', () => this.undo());
    byId('chart-redo').addEventListener('click', () => this.redo());
    byId('chart-download').addEventListener('click', () => this.download());
    byId('chart-tools-btn').addEventListener('click', () => this.panel.hidden ? this.open('objects') : this.close());
    byId('chart-compare-btn').addEventListener('click', () => this.open('compare'));
    byId('chart-tools-close').addEventListener('click', () => this.close());
    for (const tab of this.tabs) tab.addEventListener('click', () => this.open(tab.dataset.chartView, false));
    this.bindToolbar();
    this.syncActions();
  }

  bindToolbar() {
    if ('focusGroup' in HTMLElement.prototype) return;
    const toolbar = byId('chart-fullscreen-tools');
    const buttons = [...toolbar.querySelectorAll('button')];
    const activate = current => buttons.forEach(button => { button.tabIndex = button === current ? 0 : -1; });
    activate(buttons[0]);
    toolbar.addEventListener('focusin', event => activate(event.target));
    toolbar.addEventListener('keydown', event => {
      const index = buttons.indexOf(event.target);
      const direction = getComputedStyle(toolbar).direction === 'rtl' ? -1 : 1;
      const next = {
        ArrowLeft: (index - direction + buttons.length) % buttons.length,
        ArrowRight: (index + direction + buttons.length) % buttons.length,
        Home: 0,
        End: buttons.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      buttons[next].focus();
    });
  }

  setContext(symbol, interval, range) {
    const key = symbol ? getAccountStorageKey(`mara_chart_drawings_${symbol}_${interval}`) : null;
    if (this.key !== key) {
      this.key = key;
      this.redoStack = [];
      try {
        const saved = JSON.parse(localStorage.getItem(key) || '[]');
        this.drawings = Array.isArray(saved) ? saved.filter(item =>
          Object.hasOwn(names, item?.type) && Number.isFinite(item.a?.price) &&
          (singlePoint.has(item.type) || Number.isFinite(item.b?.price))
        ) : [];
      } catch {
        this.drawings = [];
      }
    }
    const context = `${symbol}:${interval}:${range}`;
    if (this.context !== context) {
      const compareSymbol = this.primarySymbol === symbol ? this.compareSymbol : null;
      this.context = context;
      if (this.primarySymbol !== symbol) this.events = [];
      this.primarySymbol = symbol;
      this.removeComparison();
      this.setMode(null);
      if (compareSymbol && this.chart.currentCandles.length) void this.loadComparison(compareSymbol);
    }
    this.syncActions();
    if (!this.panel.hidden && this.view !== 'compare') this.renderPanel();
  }

  setMode(mode) {
    if (mode && this.chart.measuring) this.chart.setMeasureMode(false);
    this.mode = mode;
    this.anchor = null;
    this.cursor = null;
    this.preview = null;
    this.chart.canvas.classList.toggle('is-drawing', Boolean(mode));
    for (const button of this.buttons) {
      const active = button.dataset.chartDrawing === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    this.hint.textContent = mode
      ? `${names[mode]} · ${singlePoint.has(mode) ? 'Choose a point' : 'Choose the first point'}. Arrow keys and Enter also work.`
      : '';
    this.chart.render();
  }

  place(point) {
    if (!this.mode || !point) return;
    if (!singlePoint.has(this.mode) && !this.anchor) {
      this.anchor = point;
      this.hint.textContent = `${names[this.mode]} · Choose the second point.`;
      this.chart.render();
      return;
    }
    const type = this.mode;
    if (this.anchor && ['fib', 'ray'].includes(type) && this.anchor.time === point.time) {
      this.hint.textContent = `${names[type]} · Choose a different candle for the second point.`;
      return;
    }
    if (this.anchor && type === 'fib' && this.anchor.price === point.price) {
      this.hint.textContent = 'Fibonacci retracement · Choose a different price for the second point.';
      return;
    }
    this.drawings.push({ type, a: this.anchor || point, b: this.anchor ? point : null });
    this.redoStack = [];
    this.setMode(null);
    this.hint.textContent = `${names[type]} added.`;
    this.save();
  }

  undo() {
    const index = this.drawings.findLastIndex(drawing => !drawing.locked);
    if (index < 0) return;
    const [drawing] = this.drawings.splice(index, 1);
    this.redoStack.push({ drawing, index });
    this.hint.textContent = 'Drawing undone.';
    this.save();
  }

  redo() {
    if (!this.redoStack.length) return;
    const { drawing, index } = this.redoStack.pop();
    this.drawings.splice(index, 0, drawing);
    this.hint.textContent = 'Drawing restored.';
    this.save();
  }

  save() {
    try {
      if (this.key) localStorage.setItem(this.key, JSON.stringify(this.drawings));
    } catch {
      this.hint.textContent = 'Drawing storage is unavailable. Changes apply for this session.';
    }
    this.syncActions();
    this.chart.render();
    if (!this.panel.hidden && this.view === 'objects') this.renderPanel();
  }

  syncActions() {
    byId('chart-undo').setAttribute('aria-disabled', String(!this.drawings.some(drawing => !drawing.locked)));
    byId('chart-redo').setAttribute('aria-disabled', String(!this.redoStack.length));
    byId('chart-download').setAttribute('aria-disabled', String(!this.chart.currentCandles.length));
  }

  draw(ctx, plot, xAtTime, y, ink, surface) {
    if (!this.drawings.length && !this.anchor) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
    ctx.clip();
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.25;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const line = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    const paint = ({ type, a, b }) => {
      const x1 = xAtTime(a.time);
      const y1 = y(a.price);
      if (type === 'level') {
        if (!Number.isFinite(y1)) return;
        line(plot.left, y1, plot.right, y1);
        ctx.fillText(priceLabel.format(a.price), plot.left + 5, y1 - 3);
        return;
      }
      if (!Number.isFinite(x1)) return;
      if (type === 'time') {
        line(x1, plot.top, x1, plot.bottom);
        return;
      }
      if (!b) return;
      const x2 = xAtTime(b.time);
      const y2 = y(b.price);
      if (![x2, y1, y2].every(Number.isFinite)) return;
      if (type === 'box') {
        ctx.globalAlpha = .12;
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        ctx.globalAlpha = 1;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      } else if (type === 'fib') {
        const left = Math.min(x1, x2);
        if (left > plot.right) return;
        const levels = fibLevels.map(level => {
          const price = b.price + (a.price - b.price) * level;
          return { y: y(price), text: `${fibLabel.format(level)} · ${priceLabel.format(price)}` };
        }).filter(level => level.y >= plot.top && level.y <= plot.bottom).sort((a, b) => a.y - b.y);
        if (!levels.length) return;
        const spacing = 14;
        const labelWidth = Math.max(...levels.map(level => ctx.measureText(level.text).width)) + 8;
        const labelX = Math.max(plot.left + 2, Math.min(left + 16, plot.right - labelWidth - 2));
        let labelY = plot.top - spacing / 2;
        levels.forEach((level, index) => {
          const maxY = plot.bottom - (levels.length - index - .5) * spacing;
          labelY = Math.min(maxY, Math.max(level.y, labelY + spacing));
          line(left, level.y, plot.right, level.y);
          if (Math.abs(level.y - labelY) > 1) line(Math.max(plot.left, labelX - 10), level.y, labelX, labelY);
          level.labelY = labelY;
        });
        for (const level of levels) {
          ctx.fillStyle = surface;
          ctx.fillRect(labelX, level.labelY - 6, labelWidth, 12);
          ctx.fillStyle = ink;
          ctx.textBaseline = 'middle';
          ctx.fillText(level.text, labelX + 4, level.labelY);
        }
        ctx.textBaseline = 'bottom';
      } else if (type === 'ray' && x1 !== x2) {
        const edge = x2 > x1 ? Math.max(x2, plot.right) : Math.min(x2, plot.left);
        line(x1, y1, edge, y1 + (y2 - y1) / (x2 - x1) * (edge - x1));
      } else {
        line(x1, y1, x2, y2);
      }
    };
    this.drawings.filter(drawing => drawing.visible !== false).forEach(paint);
    if (this.anchor) {
      ctx.setLineDash([4, 3]);
      paint({ type: this.mode, a: this.anchor, b: this.preview });
      ctx.beginPath();
      const xx = xAtTime(this.anchor.time), yy = y(this.anchor.price);
      if (Number.isFinite(xx) && Number.isFinite(yy)) {
        ctx.arc(xx, yy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  open(view, moveFocus = true) {
    if (this.panel.hidden) this.opener = view === 'compare' ? 'chart-compare-btn' : 'chart-tools-btn';
    this.view = view;
    this.panel.hidden = false;
    byId('chart-tools-btn').setAttribute('aria-expanded', String(view !== 'compare'));
    byId('chart-compare-btn').setAttribute('aria-expanded', String(view === 'compare'));
    for (const tab of this.tabs) tab.setAttribute('aria-pressed', String(tab.dataset.chartView === view));
    this.renderPanel();
    if (moveFocus) {
      const focus = view === 'compare' ? this.body.querySelector('input') : this.tabs.find(tab => tab.dataset.chartView === view);
      focus?.focus();
    }
  }

  close(restoreFocus = true) {
    if (this.panel.hidden) return false;
    this.panel.hidden = true;
    byId('chart-tools-btn').setAttribute('aria-expanded', 'false');
    byId('chart-compare-btn').setAttribute('aria-expanded', 'false');
    if (restoreFocus) byId(this.opener)?.focus();
    return true;
  }

  setEvents(events) {
    this.events = events;
    if (!this.panel.hidden && this.view === 'context') this.renderPanel();
  }

  showEvent(key) {
    this.open('context', false);
    this.body.querySelector(`[data-chart-event="${CSS.escape(String(key))}"]`)?.focus();
  }

  renderPanel() {
    this.body.replaceChildren();
    if (this.view === 'compare') {
      this.renderCompare();
      return;
    }
    if (this.view === 'context') {
      const data = this.chart.currentData;
      const details = document.createElement('dl');
      for (const [label, value] of [
        ['Symbol', data?.symbol], ['Interval', this.chart.activeInterval],
        ['Range', this.chart.activeRange], ['Loaded candles', this.chart.currentCandles.length],
        ['Source', isDemoMode() ? 'Synthetic demo' : data?.data_source], ['Exchange', data?.exchange],
      ]) {
        const term = document.createElement('dt');
        const definition = document.createElement('dd');
        term.textContent = label;
        definition.textContent = value ?? 'Unavailable';
        details.append(term, definition);
      }
      this.body.append(details);
      const heading = document.createElement('h3');
      heading.textContent = 'Dated events';
      this.body.append(heading);
      if (!this.events.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No dated corporate events are available.';
        this.body.append(empty);
      }
      for (const event of this.events) {
        const item = document.createElement('div');
        item.className = 'chart-object-entry';
        item.dataset.chartEvent = event.key;
        item.tabIndex = -1;
        const original = this.eventSource(event.url);
        item.innerHTML = `<strong>${escapeHtml(event.title)}</strong>
          <small>${escapeHtml(event.time)} · ${escapeHtml(event.source)}</small>
          ${event.publication ? `<small>Published ${escapeHtml(event.publication)}</small>` : ''}
          ${original ? `<a href="${escapeHtml(original)}" target="_blank" rel="noopener noreferrer">Original source</a>` : ''}`;
        this.body.append(item);
      }
      if (this.primarySymbol) {
        const jump = document.createElement('div');
        jump.className = 'research-jump-links';
        for (const [tab, label] of [['earnings', 'Earnings'], ['whatchanged', 'Delta'], ['anomalies', 'Anomalies']]) {
          const link = document.createElement('a');
          link.href = '#' + router.formatWorkspaceRoute('research', this.primarySymbol, tab);
          link.textContent = label;
          jump.append(link);
        }
        this.body.append(jump);
      }
      return;
    }
    this.renderObjects();
  }

  eventSource(value) {
    try {
      const url = new URL(value);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url.href;
    } catch {}
    return '';
  }

  renderObjects() {
    const action = (parent, verb, label, handler, disabled = false) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tv-scale-btn';
      button.textContent = verb;
      button.setAttribute('aria-label', `${verb} ${label}`);
      button.disabled = disabled;
      button.addEventListener('click', handler);
      parent.append(button);
      return button;
    };
    const title = (parent, name, detail) => {
      const entry = document.createElement('li');
      entry.className = 'chart-object-entry';
      const nameNode = document.createElement('strong');
      nameNode.textContent = name;
      entry.append(nameNode);
      if (detail) {
        const description = document.createElement('small');
        description.textContent = detail;
        entry.append(description);
      }
      parent.append(entry);
      return entry;
    };
    const list = document.createElement('ul');
    const refocus = index => (this.body.querySelectorAll('li')[index]?.querySelector('button') || this.tabs[0])?.focus();
    const studies = this.chart.getActiveIndicatorsList();
    studies.forEach((study, index) => {
      const label = this.chart.formatIndicatorTitle(study);
      const entry = title(list, label, 'Indicator');
      const actions = document.createElement('div');
      actions.className = 'chart-object-actions';
      action(actions, study.visible ? 'Hide' : 'Show', label, () => {
        this.chart.toggleIndicatorVisibility(study.instanceId);
        refocus(index);
      });
      action(actions, 'Edit', label, () => window.apexOpenIndicatorSettings?.(study.instanceId));
      action(actions, 'Remove', label, () => {
        this.chart.removeIndicator(study.instanceId);
        refocus(index);
      });
      entry.append(actions);
    });
    this.drawings.forEach((drawing, index) => {
      const label = `${names[drawing.type]} ${index + 1}`;
      const points = drawing.b ? [drawing.a, drawing.b] : [drawing.a];
      const entry = title(list, label, drawing.type === 'time' ? String(drawing.a.time) : points.map(point => priceLabel.format(point.price)).join(' → '));
      const actions = document.createElement('div');
      actions.className = 'chart-object-actions';
      const returnFocus = () => refocus(studies.length + index);
      action(actions, drawing.visible === false ? 'Show' : 'Hide', label, () => {
        drawing.visible = drawing.visible === false;
        this.save();
        returnFocus();
      });
      action(actions, drawing.locked ? 'Unlock' : 'Lock', label, () => {
        drawing.locked = !drawing.locked;
        this.save();
        returnFocus();
      });
      action(actions, 'Remove', label, () => {
        this.drawings.splice(index, 1);
        this.redoStack = [];
        this.save();
        returnFocus();
      }, Boolean(drawing.locked));
      entry.append(actions);
      if (drawing.locked || drawing.type === 'time') return;
      const disclosure = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Edit anchor prices';
      const form = document.createElement('form');
      const inputs = points.map((point, i) => {
        const field = document.createElement('label');
        field.textContent = `Anchor ${i + 1} price`;
        const input = document.createElement('input');
        input.className = 'screener-input';
        input.type = 'number';
        input.step = 'any';
        input.required = true;
        input.value = point.price;
        field.append(input);
        form.append(field);
        return input;
      });
      const submit = document.createElement('button');
      submit.className = 'tv-scale-btn';
      submit.type = 'submit';
      submit.textContent = 'Save prices';
      form.append(submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const prices = inputs.map(input => input.valueAsNumber);
        if (!prices.every(Number.isFinite) || (drawing.type === 'fib' && prices[0] === prices[1])) return;
        points.forEach((point, i) => { point.price = prices[i]; });
        this.save();
        returnFocus();
      });
      disclosure.append(summary, form);
      entry.append(disclosure);
    });
    if (!list.childElementCount) this.body.textContent = 'Drawings and indicators appear here.';
    else this.body.append(list);
  }

  renderCompare() {
    const form = document.createElement('form');
    const label = document.createElement('label');
    label.textContent = 'Comparison symbol';
    const input = document.createElement('input');
    input.className = 'screener-input';
    input.value = this.compareSymbol || '';
    input.placeholder = 'e.g. INFY.NS';
    input.required = true;
    input.maxLength = 24;
    input.autocomplete = 'off';
    label.append(input);
    const add = document.createElement('button');
    add.type = 'submit';
    add.className = 'tv-tb-btn';
    add.textContent = 'Apply comparison';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tv-tb-btn';
    remove.textContent = 'Remove comparison';
    remove.hidden = !this.compareSymbol;
    remove.dataset.removeComparison = '';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = this.compareStatus || this.comparisonMessage();
    form.append(label, add, remove, status);
    this.body.append(form);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const symbol = input.value.trim().toUpperCase();
      if (!/^[A-Z0-9^][A-Z0-9.^=\-]{0,23}$/.test(symbol) || symbol === this.chart.currentData?.symbol) {
        status.textContent = 'Enter a different market symbol.';
        return;
      }
      void this.loadComparison(symbol);
    });
    remove.addEventListener('click', () => {
      this.removeComparison(false);
      remove.hidden = true;
      input.value = '';
      status.textContent = this.comparisonMessage();
      input.focus();
      this.chart.render();
    });
  }

  async loadComparison(symbol) {
    this.request?.abort();
    this.comparison = null;
    this.compareSymbol = symbol;
    const input = !this.panel.hidden && this.view === 'compare' && this.body.querySelector('input');
    if (input) input.value = symbol;
    const request = new AbortController();
    this.request = request;
    this.syncScales();
    this.chart.render();
    this.setComparisonStatus(`Loading ${symbol}…`);
    const { activeInterval, activeRange } = this.chart;
    const interval = { D: '1d', W: '1wk', M: '1mo' }[activeInterval] || activeInterval;
    try {
      const data = this.chart.isIntraday()
        ? await api.getMarketCandles(symbol, interval, activeRange, request.signal)
        : await api.getStockHistory(symbol, activeRange, interval, request.signal);
      if (request.signal.aborted) return;
      const closes = new Map((data?.candles || []).map(bar => [String(bar.time), bar.close]));
      if (!this.chart.currentCandles.some(bar => bar.close > 0 && closes.get(String(bar.time)) > 0)) {
        this.setComparisonStatus(`No matching candles for ${symbol} on this interval and range.`);
        return;
      }
      this.comparison = { symbol, closes };
      this.syncScales();
      this.chart.render();
      this.setComparisonStatus(this.comparisonMessage());
    } catch {
      if (!request.signal.aborted) this.setComparisonStatus(`Could not load ${symbol}. Try again.`);
    }
  }

  setComparisonStatus(message) {
    this.compareStatus = message;
    if (this.view !== 'compare' || this.panel.hidden) return;
    this.body.querySelector('[role="status"]').textContent = message;
    this.body.querySelector('[data-remove-comparison]').hidden = !this.compareSymbol;
  }

  comparisonMessage() {
    return this.comparison
      ? `${this.comparison.symbol} and the primary symbol are rebased to 0% at the first shared visible close.`
      : 'Compare close-to-close performance on matching timestamps.';
  }

  removeComparison(refreshPanel = true) {
    this.request?.abort();
    this.compareSymbol = null;
    this.compareStatus = null;
    this.comparison = null;
    this.syncScales();
    if (refreshPanel && !this.panel.hidden && this.view === 'compare') this.renderPanel();
  }

  syncScales() {
    for (const id of ['tv-scale-log-btn', 'tv-scale-pct-btn']) {
      byId(id).setAttribute('aria-disabled', String(Boolean(this.comparison)));
    }
  }

  download() {
    if (!this.chart.currentCandles.length) return;
    this.chart.render(true);
    const source = this.chart.canvas;
    const output = document.createElement('canvas');
    const ratio = this.chart.pixelRatio || 1;
    const header = Math.round(34 * ratio);
    output.width = source.width;
    output.height = source.height + header;
    const ctx = output.getContext('2d');
    ctx.fillStyle = getComputedStyle(source).color;
    const ink = ctx.fillStyle;
    ctx.fillStyle = getComputedStyle(this.chart.container).backgroundColor;
    ctx.fillRect(0, 0, output.width, header);
    ctx.fillStyle = ink;
    ctx.font = `${12 * ratio}px monospace`;
    ctx.textBaseline = 'middle';
    const symbol = this.chart.currentData?.symbol || 'chart';
    const sourceName = isDemoMode() ? 'Synthetic demo' : this.chart.currentData?.data_source || 'Source unavailable';
    ctx.fillText(`${symbol} · ${this.chart.activeInterval} · ${sourceName}`, 12 * ratio, header / 2, output.width - 24 * ratio);
    ctx.drawImage(source, 0, header);
    output.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MARA-${symbol.replace(/[^A-Z0-9.-]/gi, '')}-${this.chart.activeInterval}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
}
