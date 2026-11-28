import { equitySearchKey, internationalEquities } from './equity-directory.js';

const marketNames = new Intl.DisplayNames(['en'], { type: 'region' });
let catalog;

export function loadListedEquities() {
  catalog ||= fetch(`${import.meta.env.BASE_URL}equities/catalog.json`).then(async response => {
    if (!response.ok) throw new Error('Stock directory unavailable');
    const { listings, markets, retrieved } = await response.json();
    const records = new Map();
    for (const [symbol, name, country, exchange, extra] of listings) {
      const [market, currency, source] = markets[country];
      records.set(symbol, {
        symbol, name, country, market, exchange, currency, source, extra, category: 'Equities',
      });
    }
    for (const item of internationalEquities.values()) {
      const existing = records.get(item.symbol);
      records.set(item.symbol, {
        ...existing,
        ...item,
        market: existing?.market || marketNames.of(item.country),
        source: existing?.source || 'MARA reference directory',
      });
    }
    const rows = [...records.values()].map(record => ({
      ...record,
      key: equitySearchKey(`${record.symbol} ${record.name} ${record.exchange} ${record.market} ${record.extra || ''}`),
    }));
    return { rows, retrieved, markets };
  }).catch(error => {
    catalog = undefined;
    throw error;
  });
  return catalog;
}

export function listingMatches(record, terms) {
  return terms.every(term => record.key.includes(term));
}

function searchRank(record, query) {
  const symbol = record.symbol.toLowerCase();
  if (symbol === query) return 0;
  if (symbol.split('.')[0] === query) return 1;
  if (equitySearchKey(record.name).startsWith(query)) return 2;
  return symbol.startsWith(query) ? 3 : 4;
}

export async function searchListedEquities(value, limit = 12) {
  const query = equitySearchKey(value);
  if (!query) return [];
  const { rows } = await loadListedEquities();
  const terms = query.split(/\s+/);
  return rows.filter(record => listingMatches(record, terms))
    .sort((a, b) => searchRank(a, query) - searchRank(b, query) || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}
