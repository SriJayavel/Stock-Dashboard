import directory from './global-equities.json';

export function internationalMarket(symbol) {
  const suffix = symbol.includes('.') ? symbol.split('.').at(-1).toUpperCase() : '';
  return Object.hasOwn(directory.markets, suffix) ? directory.markets[suffix] : undefined;
}

export const internationalEquities = new Map(directory.listings.map(([symbol, name, ...listing]) => {
  const [exchange, country, currency, exchange_timezone] = listing.length ? listing : internationalMarket(symbol);
  return [symbol, { symbol, name, exchange, country, currency, exchange_timezone, category: 'Equities' }];
}));
export const internationalEquityAliases = directory.aliases;

export function equitySearchKey(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').replaceAll('’', "'").toLowerCase().trim();
}
