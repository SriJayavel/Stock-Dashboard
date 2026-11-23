const quotesBySnapshot = new WeakMap();
const priceFormats = {
  'en-IN': new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  'en-US': new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

export function marketQuotes(snapshot) {
  if (!snapshot) return new Map();
  if (!quotesBySnapshot.has(snapshot)) {
    const quotes = new Map(Object.values(snapshot.macro || {}).flat().map(quote => [quote.symbol, quote]));
    // An explicit index entry wins over any cross-asset duplicate.
    for (const quote of snapshot.macro?.Indices || []) quotes.set(quote.symbol, quote);
    const nifty = quotes.get('^NSEI');
    if (!Number.isFinite(nifty?.price) && Number.isFinite(snapshot.hero?.price)) {
      quotes.set('^NSEI', { ...snapshot.hero, symbol: '^NSEI', name: 'NIFTY 50' });
    }
    quotesBySnapshot.set(snapshot, quotes);
  }
  return quotesBySnapshot.get(snapshot);
}

export function quotePrice(value, currency) {
  if (!Number.isFinite(value)) return 'Unavailable';
  return currency + priceFormats[currency === '₹' ? 'en-IN' : 'en-US'].format(value);
}

export function quoteMovement(value, suffix = '') {
  if (!Number.isFinite(value)) return 'Unavailable';
  const prefix = value > 0 ? '▲ +' : value < 0 ? '▼ −' : '';
  return prefix + Math.abs(value).toFixed(2) + suffix;
}
