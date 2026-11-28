import { escapeHtml, provenance } from './provenance.js';
import { screenerBuilder, SCREENER_METRICS } from './screener_builder.js';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const changeFormat = new Intl.NumberFormat('en', {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero',
});
const priceFormats = [2, 4].map(digits => new Intl.NumberFormat('en', {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
}));
const moves = {
  up: { label: 'gainers', accepts: value => value > 0 },
  down: { label: 'decliners', accepts: value => value < 0 },
  flat: { label: 'unchanged', accepts: value => value === 0 },
  missing: { label: 'unavailable', accepts: value => !Number.isFinite(value) },
};
const operators = { '>': 'Greater than', '>=': 'At least', '<': 'Less than', '<=': 'At most', '=': 'Approximately equal' };
const byId = id => document.getElementById(id);

function normalizeItem(item, synthetic) {
  const price = [item.price, item.current_price].find(Number.isFinite) ?? null;
  return {
    ...item,
    price,
    current_price: price,
    change_pct: Number.isFinite(item.change_pct) ? item.change_pct : null,
    currency: item.currency || item.symbol.match(/([A-Z]{3})=X$/)?.[1] || (/\.(NS|BO)$/.test(item.symbol) ? 'INR' : 'USD'),
    market_cap: Number.isFinite(item.market_cap) && item.market_cap > 0 ? item.market_cap : null,
    data_source: synthetic ? 'Synthetic demo' : item.data_source || item.source || 'MARA market snapshot',
  };
}

export function mountDiscover({ fetchSnapshot, isDemoMode, currencyFor, formatUnits, quoteDetails, chartHref, openAlert, directory }) {
  const root = byId('workspace-discover');
  const universes = [...root.querySelectorAll('[data-universe]')];
  const table = byId('discover-table');
  const region = byId('discover-table-region');
  const body = byId('screener-table-body');
  const status = byId('discover-results');
  const notice = byId('discover-state');
  const breadth = byId('discover-breadth');
  const search = byId('discover-search');
  const movement = byId('discover-move');
  const mobileSort = byId('discover-mobile-sort');
  const clear = byId('discover-clear');
  const rulesForm = byId('screener-builder-wrap');
  const ruleToggle = byId('toggle-screener-builder-btn');
  const ruleCount = byId('filter-count-badge');
  const ruleRows = byId('screener-rules-container');
  const combinator = byId('screener-combinator');
  const addRule = byId('screener-add-rule-btn');
  const apply = byId('screener-run-builder-btn');
  const csv = byId('screener-export-csv-btn');
  const json = byId('screener-export-json-btn');
  const headers = [...table.querySelectorAll('th[data-sort]')];
  let universe;
  let request;
  let assets = [];
  let visible = [];
  let appliedRules = [];
  let appliedCombinator = 'AND';
  let phase = 'loading';
  let sortKey = 'change_pct';
  let sortDirection = 'descending';
  const rowItems = new WeakMap();

  function ordered(items) {
    const factor = sortDirection === 'ascending' ? 1 : -1;
    return [...items].sort((a, b) => {
      if (sortKey === 'symbol') return factor * collator.compare(a.symbol, b.symbol);
      const av = a[sortKey];
      const bv = b[sortKey];
      if (!Number.isFinite(av)) return Number.isFinite(bv) ? 1 : 0;
      if (!Number.isFinite(bv)) return -1;
      return factor * (av - bv);
    });
  }

  function updateStatus(sortLabel) {
    if (phase === 'loading') {
      status.textContent = 'Loading market snapshot…';
    } else if (phase === 'error') {
      status.textContent = 'Market snapshot unavailable';
    } else {
      const count = `${visible.length} of ${assets.length} assets`;
      status.textContent = sortLabel ? `${count} · ${sortLabel}, ${sortDirection}` : count;
    }
  }

  function sortBy(key, direction) {
    sortDirection = direction || (sortKey === key && sortDirection === 'ascending' ? 'descending' : 'ascending');
    sortKey = key;
    let label;
    for (const header of headers) {
      if (header.dataset.sort === key) {
        header.setAttribute('aria-sort', sortDirection);
        label = header.textContent.trim();
      } else header.removeAttribute('aria-sort');
    }
    mobileSort.value = `${key}:${sortDirection}`;
    visible = ordered(visible);
    const rows = new Map([...body.rows].map(row => [rowItems.get(row), row]));
    for (const item of visible) {
      const row = rows.get(item);
      if (body.moveBefore) body.moveBefore(row, null);
      else body.append(row);
    }
    updateStatus(label);
  }

  function renderBreadth() {
    breadth.hidden = phase !== 'ready' || assets.length === 0;
    if (breadth.hidden) return;
    const counts = Object.entries(moves).map(([key, { label, accepts }]) => ({
      key, label, count: assets.filter(item => accepts(item.change_pct)).length,
    }));
    breadth.querySelector('.discover-breadth-meter').innerHTML = counts
      .map(({ key, count }) => `<span class="discover-${key}" style="flex-grow:${count}"></span>`).join('');
    breadth.querySelector('.discover-breadth-labels').innerHTML = counts
      .map(({ key, count, label }) => `<span class="discover-${key}"><strong>${count}</strong> ${label}</span>`).join('');
  }

  function createRow(item) {
    const symbol = escapeHtml(item.symbol);
    const currency = item.currency_symbol || currencyFor(item.symbol, item.currency);
    const hasPrice = Number.isFinite(item.price);
    const hasChange = Number.isFinite(item.change_pct);
    const isForex = item.symbol.endsWith('=X');
    const price = hasPrice ? `${currency}${priceFormats[isForex ? 1 : 0].format(item.price)}` : '—';
    const priceContent = hasPrice ? provenance(price, {
      label: `${item.symbol} last price`, details: quoteDetails(item, 'MARA market snapshot'),
    }) : price;
    const change = hasChange ? `${changeFormat.format(item.change_pct)}%` : '—';
    const tone = !hasChange ? 'missing' : item.change_pct > 0 ? 'up' : item.change_pct < 0 ? 'down' : 'flat';
    const cap = item.market_cap === null ? '—' : `<span data-units-value="${item.market_cap}" data-units-currency="${escapeHtml(currency)}">${escapeHtml(formatUnits(item.market_cap, currency))}</span>`;
    const pe = Number.isFinite(item.pe_trailing) ? `${item.pe_trailing.toFixed(1)}×` : '—';
    const chart = item.demo_snapshot_only ? null : escapeHtml(chartHref(item.symbol));
    const row = document.createElement('tr');
    row.setAttribute('role', 'row');
    row.dataset.symbol = item.symbol;
    row.innerHTML = `
      <th scope="row" role="rowheader">
        ${chart ? `<a href="${chart}" class="discover-symbol">${symbol}</a>` : `<span class="discover-symbol">${symbol}</span>`}
        <span class="discover-name">${escapeHtml(item.name || item.symbol)}</span>
        ${item.sector ? `<span class="discover-sector">${escapeHtml(item.sector)}</span>` : ''}
      </th>
      <td role="cell" class="discover-numeric" data-label="Price">${priceContent}</td>
      <td role="cell" class="discover-numeric discover-${tone}" data-label="Change %">${change}</td>
      <td role="cell" class="discover-numeric" data-label="Market cap">${cap}</td>
      <td role="cell" class="discover-numeric" data-label="Trailing P/E">${pe}</td>
      <td role="cell" class="discover-row-actions">
        ${chart ? `<a class="discover-button" href="${chart}" aria-label="Open ${symbol} chart">Chart</a>` : '<span class="discover-sector">Snapshot only</span>'}
        <button type="button" class="discover-button" data-asset-alert aria-label="Create alert for ${symbol}">Alert</button>
      </td>`;
    rowItems.set(row, item);
    return row;
  }

  function renderResults() {
    const term = search.value.trim().toLocaleLowerCase();
    const move = movement.value;
    const hasFilters = Boolean(term || move !== 'all' || appliedRules.length);
    const candidates = assets.filter(item =>
      (!term || [item.symbol, item.name, item.sector].some(text => String(text ?? '').toLocaleLowerCase().includes(term))) &&
      (move === 'all' || moves[move]?.accepts(item.change_pct))
    );
    visible = ordered(screenerBuilder.execute(candidates, appliedRules, appliedCombinator));
    updateStatus();
    region.hidden = !visible.length;
    region.setAttribute('aria-busy', String(phase === 'loading'));
    body.replaceChildren(...visible.map(createRow));
    csv.disabled = json.disabled = visible.length === 0;
    clear.disabled = !hasFilters && !screenerBuilder.conditions.length;
    apply.disabled = phase !== 'ready';
    ruleCount.hidden = appliedRules.length === 0;
    ruleCount.textContent = appliedRules.length;
    notice.hidden = Boolean(visible.length);
    if (notice.hidden) return;
    if (phase === 'loading') {
      notice.innerHTML = '<div class="discover-placeholder" aria-hidden="true"><span></span><span></span><span></span></div>';
    } else if (phase === 'error') {
      notice.innerHTML = '<strong>Unable to load this universe</strong><button type="button" class="discover-button" data-retry>Retry snapshot</button>';
    } else if (assets.length) {
      notice.innerHTML = '<strong>No assets match your filters</strong><button type="button" class="discover-button" data-clear>Clear filters</button>';
    } else {
      notice.innerHTML = '<strong>No quotes in this snapshot</strong><p>Choose another universe or retry this one.</p><button type="button" class="discover-button" data-retry>Retry snapshot</button>';
    }
  }

  function renderRuleEditor() {
    ruleRows.innerHTML = screenerBuilder.conditions.map((rule, index) => {
      const selected = SCREENER_METRICS.find(metric => metric.id === rule.metric);
      return `<div class="discover-rule-row" data-rule="${rule.id}">
        <select class="screener-select" data-rule-field="metric" aria-label="Metric for condition ${index + 1}">
          ${SCREENER_METRICS.map(metric => `<option value="${metric.id}" ${metric.id === rule.metric ? 'selected' : ''}>${metric.label}</option>`).join('')}
        </select>
        <select class="screener-select" data-rule-field="operator" aria-label="Operator for condition ${index + 1}">
          ${Object.entries(operators).map(([key, label]) => `<option value="${escapeHtml(key)}" ${key === rule.operator ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <label class="discover-threshold">
          <input type="number" step="any" required data-rule-field="value" class="screener-input" value="${Number.isFinite(rule.value) ? rule.value : ''}" aria-label="Threshold for condition ${index + 1}">
          <span data-rule-unit>${selected.unit}</span>
        </label>
        <button type="button" class="discover-button" data-remove-rule aria-label="Remove condition ${index + 1}">Remove</button>
      </div>`;
    }).join('');
    combinator.value = screenerBuilder.combinator;
  }

  function clearFilters() {
    search.value = '';
    movement.value = 'all';
    appliedRules = [];
    appliedCombinator = 'AND';
    screenerBuilder.reset();
    renderRuleEditor();
    renderResults();
    search.focus();
  }

  async function load(next, retry = false) {
    const selected = universes.find(link => link.dataset.universe === next) || universes[0];
    if (!retry && request && selected.dataset.universe === universe) return;
    universe = selected.dataset.universe;
    for (const link of universes) {
      link.classList.toggle('active', link === selected);
      if (link === selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    byId('discover-universe-title').textContent = selected.textContent;
    const directoryMode = universe === 'all_stocks';
    byId('discover-stock-directory').hidden = !directoryMode;
    byId('discover-snapshot-panel').hidden = directoryMode;
    if (directoryMode) {
      request?.abort();
      request = null;
      byId('discover-source').textContent = 'Listing directory';
      void directory.load();
      return;
    }
    directory.stop();
    const synthetic = isDemoMode();
    byId('discover-source').textContent = synthetic ? 'Synthetic demo' : 'Market snapshot';
    request?.abort();
    const controller = new AbortController();
    request = controller;
    assets = [];
    phase = 'loading';
    renderBreadth();
    renderResults();
    try {
      const data = await fetchSnapshot(universe, controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(data?.items)) throw new Error('Snapshot unavailable');
      assets = data.items.filter(item => typeof item?.symbol === 'string' && item.symbol)
        .map(item => normalizeItem(item, synthetic));
      phase = 'ready';
    } catch {
      if (controller.signal.aborted) return;
      phase = 'error';
    }
    renderBreadth();
    renderResults();
  }

  const sortHeader = button => sortBy(button.closest('th').dataset.sort);
  table.addEventListener('command', event => {
    if (event.command === '--sort') sortHeader(event.source);
  });
  if (!('commandForElement' in HTMLButtonElement.prototype)) {
    for (const button of table.querySelectorAll('thead button')) button.addEventListener('click', () => sortHeader(button));
  }
  mobileSort.addEventListener('change', () => sortBy(...mobileSort.value.split(':')));
  search.addEventListener('input', renderResults);
  movement.addEventListener('change', renderResults);
  clear.addEventListener('click', clearFilters);
  notice.addEventListener('click', event => {
    if (event.target.closest('[data-clear]')) clearFilters();
    if (event.target.closest('[data-retry]')) {
      load(universe, true);
      root.querySelector('[aria-current="page"]').focus();
    }
  });
  body.addEventListener('click', event => {
    const button = event.target.closest('[data-asset-alert]');
    if (button) openAlert(button.closest('tr').dataset.symbol);
  });
  ruleToggle.addEventListener('click', () => {
    rulesForm.hidden = !rulesForm.hidden;
    ruleToggle.setAttribute('aria-expanded', String(!rulesForm.hidden));
    if (rulesForm.hidden) return;
    if (!screenerBuilder.conditions.length) screenerBuilder.addCondition();
    renderRuleEditor();
    renderResults();
  });
  addRule.addEventListener('click', () => {
    screenerBuilder.addCondition();
    renderRuleEditor();
    clear.disabled = false;
    ruleRows.querySelector('.discover-rule-row:last-child select').focus();
  });
  ruleRows.addEventListener('input', event => {
    const field = event.target.dataset.ruleField;
    if (!field) return;
    const row = event.target.closest('[data-rule]');
    const id = Number(row.dataset.rule);
    screenerBuilder.updateCondition(id, field, event.target.value);
    if (field === 'metric') {
      const metric = SCREENER_METRICS.find(item => item.id === event.target.value);
      screenerBuilder.updateCondition(id, 'operator', metric.defaultOp);
      screenerBuilder.updateCondition(id, 'value', metric.defaultVal);
      row.querySelector('[data-rule-field="operator"]').value = metric.defaultOp;
      row.querySelector('[data-rule-field="value"]').value = metric.defaultVal;
      row.querySelector('[data-rule-unit]').textContent = metric.unit;
    }
  });
  ruleRows.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-rule]');
    if (!button) return;
    screenerBuilder.removeCondition(Number(button.closest('[data-rule]').dataset.rule));
    renderRuleEditor();
    addRule.focus();
  });
  combinator.addEventListener('change', () => { screenerBuilder.combinator = combinator.value; });
  rulesForm.addEventListener('submit', event => {
    event.preventDefault();
    appliedRules = screenerBuilder.conditions.map(rule => ({ ...rule }));
    appliedCombinator = screenerBuilder.combinator;
    renderResults();
  });
  csv.addEventListener('click', () => screenerBuilder.exportCSV(visible));
  json.addEventListener('click', () => screenerBuilder.exportJSON(visible));

  return {
    load,
    stop() {
      request?.abort();
      request = null;
      directory.stop();
    },
  };
}
