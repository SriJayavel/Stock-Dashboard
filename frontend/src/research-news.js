import { escapeHtml } from './provenance.js';
import { internationalMarket } from './equity-directory.js';
import { quoteMovement } from './market-quotes.js';

const tcsFilings = 'https://www.tcs.com/content/dam/tcs/pdf/discover-tcs/investor-relations/corporate-actions/2026-27/';
const companyArchive = {
  'TCS.NS': [
    {
      title: 'TCS completes the acquisition of BBY Services India LLP',
      publisher: 'TCS Investor Relations',
      source_type: 'Primary filing',
      published_date: '2026-10-15',
      impact_area: 'Deal / Contract',
      why_it_matters: 'The filing records the completion date for acquiring the full partnership interest.',
      link: tcsFilings + 'completion-of-acquisition-of-bby-services-india-llp.pdf',
    },
    {
      title: 'TCS files September-quarter results and declares a ₹12 interim dividend',
      publisher: 'TCS Investor Relations',
      source_type: 'Primary filing',
      published_date: '2026-10-08',
      impact_area: 'Earnings',
      why_it_matters: 'Audited quarterly results and the dividend record date give two concrete events to check against price history.',
      link: tcsFilings + 'financial-results-qtr-sep-30-2026.pdf',
    },
  ],
};

const itPeers = new Set(['TCS.NS', 'WIPRO.NS', 'HCLTECH.NS', 'TECHM.NS', 'LTIM.NS', 'PERSISTENT.NS', 'MPHASIS.NS']);
const sectorArchive = {
  title: 'Infosys reports its September quarter and revises FY27 revenue guidance',
  publisher: 'Infosys Investor Relations',
  source_type: 'Issuer release',
  published_date: '2026-10-23',
  impact_area: 'Earnings',
  why_it_matters: 'A peer’s revised guidance gives a comparison point for Indian IT services demand.',
  link: 'https://www.infosys.com/investors/reports-filings/quarterly-results/2026-2027/q2/documents/ifrs-usd-press-release.pdf',
};

const indiaArchive = {
  title: 'RBI publishes its October rate decision in the monthly bulletin',
  publisher: 'Reserve Bank of India',
  source_type: 'Central bank bulletin',
  published_date: '2026-10-23',
  impact_area: 'Macro',
  why_it_matters: 'The bulletin records a 25-basis-point repo rate increase to 5.50%, a benchmark for domestic borrowing costs.',
  link: 'https://www.rbi.org.in/scripts/bs_viewbulletin.aspx/Home.aspx/BS_ViewBulletin.aspx?Id=24511',
};

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
const timestampFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
const filters = { all: 'All', earnings: 'Earnings', deals: 'Deals', filings: 'Filings' };

function sourceUrl(link) {
  try {
    const url = new URL(link);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function renderItem(item, url, priceLinks) {
  const rawDate = item.published_date || '';
  const date = new Date(rawDate);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rawDate);
  const timestamp = Number.isFinite(date.getTime())
    ? `<time datetime="${dateOnly ? rawDate : date.toISOString()}">${dateOnly ? dateFormat.format(date) : timestampFormat.format(date) + ' UTC'}</time>`
    : 'Date unavailable';
  const catalyst = String(item.impact_area || 'Company update');
  const source = item.source_type || 'Publisher report';
  const tags = [
    /earnings|guidance/i.test(catalyst) && 'earnings',
    /deal|contract|acquisition/i.test(catalyst) && 'deals',
    /filing/i.test(source) && 'filings',
  ].filter(Boolean).join(' ');
  const takeaway = item.why_it_matters || item.summary || 'Use the source and price research links to review this event.';

  return `
    <article class="research-news-item" data-news-tags="${tags}">
      <div class="research-news-meta">
        <span class="research-news-catalyst">${escapeHtml(catalyst)}</span>
        <span>${escapeHtml(item.publisher)}</span>
        <span>${escapeHtml(source)}</span>
        ${timestamp}
      </div>
      <h4><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)} <span aria-hidden="true">↗</span></a></h4>
      <p class="research-news-takeaway">${escapeHtml(takeaway)}</p>
      <div class="research-news-price-links" role="group" aria-label="Check price action for ${escapeHtml(item.title)}">${priceLinks}</div>
    </article>`;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function researchSources(symbol, listing, quote, data, demo, priceLinks) {
  const issuer = data.research_dossier?.asset_profile;
  const name = [quote?.name, listing?.name, data.name].find(value => value && value !== symbol);
  const nameAndSymbol = [name, symbol].filter(Boolean).join(' ');
  const market = internationalMarket(symbol);
  const exchange = listing?.exchange || quote?.exchange || market?.[0];
  const country = listing?.country || market?.[1];
  const region = country && /^[A-Z]{2}$/.test(country) ? regionNames.of(country)
    : country || (/\.(?:NS|BO)$/i.test(symbol) ? 'India' : '');
  const sector = [quote?.sector, issuer?.sector, quote?.industry, issuer?.industry]
    .find(value => value && !/^(general|unknown|financial instrument|unclassified|n\/a|-)$/i.test(value));
  const links = [
    ['Company headlines', 'https://news.google.com/search?', { q: nameAndSymbol }],
    ['Filings and investor relations', 'https://www.google.com/search?', { q: `${nameAndSymbol} investor relations filings` }],
    ['Sector / Market headlines', 'https://news.google.com/search?', {
      q: [sector, region || exchange, sector || region || exchange ? 'stock market' : nameAndSymbol + ' industry'].filter(Boolean).join(' '),
    }],
  ];
  const move = quote?.change_pct;
  const asOf = new Date(quote?.last_updated || quote?.source_timestamp || '');
  const context = Number.isFinite(move) ? `<p>${demo ? 'Synthetic' : 'Reported'} quote change
    <strong class="${move > 0 ? 'gain' : move < 0 ? 'loss' : ''}">${quoteMovement(move, '%')}</strong>
    ${Number.isFinite(asOf.getTime()) ? `<time datetime="${asOf.toISOString()}">· ${timestampFormat.format(asOf)} UTC</time>` : ''}
  </p>` : '';
  return `<section class="research-news-state research-news-sources" aria-label="Research sources">
    <div class="research-news-sources-heading">
      <h3>Research sources</h3>
      <span>${escapeHtml([sector, region || exchange].filter(Boolean).join(' · ') || symbol)}</span>
    </div>
    <div class="research-jump-links">
      ${links.map(([label, base, params]) =>
        `<a href="${escapeHtml(base + new URLSearchParams(params))}" target="_blank" rel="noopener noreferrer">${label} <span aria-hidden="true">↗</span></a>`
      ).join('')}
    </div>
    ${context ? `<div class="research-news-price-context">${context}<div class="research-jump-links">${priceLinks}</div></div>` : ''}
  </section>`;
}

export function renderAttributedNews(container, { symbol, data, listing, quote, state, demo, onRetry, actionLinks, priceLinks }) {
  const selected = container.dataset.newsSymbol === symbol ? container.querySelector('[aria-pressed="true"]')?.dataset.newsFilter : 'all';
  container.dataset.newsSymbol = symbol;
  const readyItems = Array.isArray(data.news_events) ? data.news_events : [];
  const sourceItems = new Set();
  const recent = [];
  for (const item of readyItems) {
    const url = sourceUrl(item?.link);
    if (!url || !item.title || !item.publisher || sourceItems.has(url)) continue;
    sourceItems.add(url);
    recent.push(renderItem(item, url, priceLinks));
  }
  const archive = (companyArchive[symbol] || [])
    .filter(item => !sourceItems.has(item.link))
    .map(item => renderItem(item, item.link, priceLinks));
  const related = [
    itPeers.has(symbol) ? { label: 'Sector context', item: sectorArchive } : null,
    /(?:\.(?:NS|BO)$|^\^(?:NSE|BSESN))/i.test(symbol) ? { label: 'Market context', item: indiaArchive } : null,
  ].filter(Boolean);
  const reason = demo ? 'The demo uses archived sources where available and synthetic prices.'
    : data.news_status === 'loading' ? 'Checking the news feed for this listing.'
      : data.news_status === 'unavailable' ? 'The news provider is temporarily unavailable.'
      : state === 'unavailable' && !data.news_status ? 'The research feed did not return news data.'
      : data.news_status === 'ready' || readyItems.length ? 'The feed returned no recent items with an attributable source link.'
        : 'A live verified company feed is unavailable.';
  const sections = [
    ['Symbol-attributed news', recent.join('')],
    ['Archived company disclosures', archive.join('')],
    ['Sector / Market context', related.map(({ label, item }) =>
      `<div class="research-news-context" data-news-context><p>${label} · Archived source</p>${renderItem(item, item.link, priceLinks)}</div>`
    ).join('')],
  ].filter(([, items]) => items);
  const hasItems = sections.length > 0;

  container.innerHTML = `
    ${recent.length ? '' : `<div class="research-news-state">
      <strong>${demo ? 'Archived research' : `News coverage for ${escapeHtml(symbol)}`}</strong>
      <p>${reason}${!hasItems ? ' Use the research views below to check results and price activity.' : ''}</p>
      <div class="research-jump-links">${actionLinks}
        ${data.news_status === 'unavailable' ? '<button type="button" class="ghost-btn ghost-btn-sm" data-retry-news>Retry news</button>' : ''}
      </div>
    </div>`}
    ${researchSources(symbol, listing, quote, data, demo, priceLinks)}
    ${hasItems ? `
      <div class="research-news-filters" role="group" aria-label="Filter news by catalyst">
        ${Object.entries(filters).map(([key, label]) => `<button type="button" class="ghost-btn ghost-btn-sm" data-news-filter="${key}" aria-pressed="false">${label}</button>`).join('')}
      </div>
      <p class="research-news-no-match" role="status" hidden>No items match this filter. Select All to see available sources.</p>
      ${sections.map(([label, items]) => `<section class="research-news-list"><h3>${label}</h3>${items}</section>`).join('')}
    ` : ''}
  `;

  container.querySelector('[data-retry-news]')?.addEventListener('click', onRetry);
  if (!hasItems) return;
  const buttons = [...container.querySelectorAll('[data-news-filter]')];
  const applyFilter = key => {
    let count = 0;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.newsFilter === key));
    for (const item of container.querySelectorAll('[data-news-tags]')) {
      const visible = key === 'all' || item.dataset.newsTags.split(' ').includes(key);
      (item.closest('[data-news-context]') || item).hidden = !visible;
      if (visible) count++;
    }
    for (const section of container.querySelectorAll('.research-news-list')) {
      section.hidden = !section.querySelector(':scope > article:not([hidden]), :scope > [data-news-context]:not([hidden])');
    }
    container.querySelector('.research-news-no-match').hidden = count !== 0;
  };
  for (const button of buttons) button.addEventListener('click', () => applyFilter(button.dataset.newsFilter));
  applyFilter(selected || 'all');
}
