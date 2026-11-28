import { equitySearchKey } from './equity-directory.js';
import { listingMatches, loadListedEquities } from './listed-equities.js';
import { escapeHtml, provenance } from './provenance.js';

const PAGE_SIZE = 25;
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const number = new Intl.NumberFormat('en');
const movement = new Intl.NumberFormat('en', { maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: 'exceptZero' });

export function mountStockDirectory(root, { chartHref, isDemoMode, hasDemoHistory, batchQuotes, formatPrice, quoteDetails }) {
  root.append(document.getElementById('stock-directory-template').content.cloneNode(true));
  const get = name => root.querySelector(`[data-listing-${name}]`);
  const search = get('search');
  const market = get('market');
  const sort = get('sort');
  const table = get('table');
  const body = table.querySelector('tbody');
  const status = get('status');
  const quoteButton = get('quotes');
  const quoteStatus = get('quote-status');
  const previous = get('prev');
  const next = get('next');
  const cachedQuotes = new Map();
  let data;
  let sorted;
  let loading = false;
  let page = 0;
  let total = 0;
  let visible = [];
  let quoteRequest;

  function renderRows() {
    const demo = isDemoMode();
    body.innerHTML = visible.map(asset => {
      const quote = cachedQuotes.get(asset.symbol);
      const price = [quote?.current_price, quote?.price].find(Number.isFinite);
      const name = escapeHtml(asset.name);
      const symbol = escapeHtml(asset.symbol);
      const chartAvailable = !demo || hasDemoHistory(asset.symbol);
      const href = chartAvailable ? escapeHtml(chartHref(asset.symbol)) : null;
      const formattedPrice = Number.isFinite(price)
        ? provenance(formatPrice(price, asset.symbol, quote.currency || asset.currency), {
          label: `${asset.symbol} last price`, details: quoteDetails(quote, 'MARA cached overview'),
        }) : '—';
      const change = quote?.change_pct;
      let coverage = 'Quote not loaded';
      if (demo && !chartAvailable) coverage = 'Listing only';
      else if (Number.isFinite(price)) coverage = demo ? 'Synthetic quote' : 'Cached quote';
      else if (quote) coverage = 'No cached quote';
      return `<tr role="row" data-stock-symbol="${symbol}">
        <th scope="row" role="rowheader">
          ${href ? `<a href="${href}" class="discover-symbol">${symbol}</a>` : `<span class="discover-symbol">${symbol}</span>`}
          <span class="discover-name">${name}</span>
          ${asset.extra && asset.country !== 'JP' ? `<span class="discover-sector">${escapeHtml(asset.extra)}</span>` : ''}
        </th>
        <td role="cell" data-label="Exchange" title="${escapeHtml(asset.source)}">
          <span class="discover-name">${escapeHtml(asset.exchange)}</span>
          <span class="discover-sector">${escapeHtml(asset.market)} · ${escapeHtml(asset.currency)}</span>
        </td>
        <td role="cell" data-label="Last price" class="discover-numeric">${formattedPrice}</td>
        <td role="cell" data-label="Change %" class="discover-numeric ${change > 0 ? 'discover-up' : change < 0 ? 'discover-down' : ''}">${Number.isFinite(change) ? `${movement.format(change)}%` : '—'}</td>
        <td role="cell" data-label="Quote coverage" class="stock-directory-coverage">${coverage}</td>
      </tr>`;
    }).join('');
  }

  function render() {
    if (!data) return;
    quoteRequest?.abort();
    quoteRequest = undefined;
    quoteButton.removeAttribute('aria-disabled');
    quoteStatus.textContent = '';
    const terms = equitySearchKey(search.value).split(/\s+/).filter(Boolean);
    const country = market.value;
    const key = sort.value;
    const matches = sorted[key].filter(row => (!country || row.country === country) && listingMatches(row, terms));
    total = matches.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    const start = page * PAGE_SIZE;
    visible = matches.slice(start, start + PAGE_SIZE);
    const first = number.format(start + 1);
    const range = visible.length === 1 ? first : `${first}–${number.format(start + visible.length)}`;
    status.textContent = total ? `${range} of ${number.format(total)} ${total === 1 ? 'listing' : 'listings'}` : '0 listings';
    get('empty').hidden = Boolean(total);
    table.hidden = get('footer').hidden = !total;
    get('page').textContent = `Page ${number.format(page + 1)} of ${number.format(pages)}`;
    previous.closest('nav').hidden = pages <= 1;
    previous.disabled = page === 0;
    next.disabled = page + 1 >= pages;
    const demo = isDemoMode();
    quoteButton.disabled = !visible.some(asset => !demo || hasDemoHistory(asset.symbol));
    quoteButton.textContent = demo ? 'Load demo quotes' : 'Check cached quotes';
    if (demo && total && quoteButton.disabled) quoteStatus.textContent = 'No synthetic quotes on this page';
    renderRows();
  }

  async function load() {
    if (data || loading) return;
    loading = true;
    get('error').hidden = true;
    status.textContent = 'Loading listing directory…';
    try {
      data = await loadListedEquities();
      sorted = Object.fromEntries(['name', 'symbol'].map(key => [key, [...data.rows]
        .sort((a, b) => collator.compare(a[key], b[key]) || collator.compare(a.symbol, b.symbol))]));
      const countries = new Map(data.rows.map(row => [row.country, row.market]));
      for (const [country, name] of [...countries].sort((a, b) => collator.compare(a[1], b[1]))) {
        market.append(new Option(name, country));
      }
      get('date').textContent = `Listing files retrieved ${data.retrieved}.`;
      get('sources').replaceChildren(...Object.values(data.markets).map(([, , label, url]) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = url;
        link.textContent = label;
        item.append(link);
        return item;
      }));
      const additional = document.createElement('li');
      additional.textContent = 'Selected listings from the MARA reference directory';
      get('sources').append(additional);
      render();
    } catch {
      status.textContent = 'Listing directory unavailable';
      get('error').hidden = false;
    } finally {
      loading = false;
    }
  }

  function changePage(offset) {
    const focused = document.activeElement;
    page += offset;
    render();
    if (focused === previous && previous.disabled) next.focus();
    if (focused === next && next.disabled) previous.focus();
    table.scrollTop = 0;
  }

  async function loadQuotes() {
    const symbols = visible.filter(asset => !isDemoMode() || hasDemoHistory(asset.symbol)).map(asset => asset.symbol);
    if (!symbols.length || quoteRequest) return;
    const controller = new AbortController();
    quoteRequest = controller;
    quoteButton.setAttribute('aria-disabled', 'true');
    quoteStatus.textContent = 'Loading page quotes…';
    try {
      const quotes = await batchQuotes(symbols, controller.signal);
      if (controller.signal.aborted) return;
      const lookup = new Map(quotes.map(quote => [quote.symbol, quote]));
      for (const symbol of symbols) cachedQuotes.set(symbol, lookup.get(symbol) || {});
      const count = symbols.filter(symbol => {
        const quote = cachedQuotes.get(symbol);
        return Number.isFinite(quote.current_price) || Number.isFinite(quote.price);
      }).length;
      quoteStatus.textContent = `${count} of ${visible.length} ${isDemoMode() ? 'synthetic' : 'cached'} quotes available`;
      renderRows();
    } catch {
      if (!controller.signal.aborted) quoteStatus.textContent = 'Could not load page quotes. Try again.';
    } finally {
      if (quoteRequest === controller) {
        quoteRequest = undefined;
        quoteButton.removeAttribute('aria-disabled');
      }
    }
  }

  const resetPage = () => { page = 0; render(); };
  search.addEventListener('input', resetPage);
  market.addEventListener('change', resetPage);
  sort.addEventListener('change', resetPage);
  previous.addEventListener('click', () => changePage(-1));
  next.addEventListener('click', () => changePage(1));
  quoteButton.addEventListener('click', loadQuotes);
  get('retry').addEventListener('click', () => { void load(); search.focus(); });
  return {
    load,
    focus() {
      root.scrollIntoView({ block: 'start' });
      root.querySelector('h2').focus({ preventScroll: true });
    },
    stop() {
      quoteRequest?.abort();
      quoteRequest = undefined;
      quoteButton.removeAttribute('aria-disabled');
      quoteStatus.textContent = '';
    },
  };
}
