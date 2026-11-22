/** @param {string} seed */
export function seededRandom(seed) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.codePointAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {number} value @param {number} [precision] */
export function roundPrice(value, precision = 2) {
  return Number(value.toFixed(precision));
}

/** @param {number} price @param {number} volatility @param {() => number} random @param {number} [drift] */
export function walkStep(price, volatility, random, drift = 0) {
  return price * Math.exp(drift + (random() - random()) * volatility);
}

/**
 * @param {string} symbol
 * @param {number} open
 * @param {number} volatility
 * @param {number} [precision]
 */
export function intradaySeries(symbol, open, volatility, precision = 2) {
  const random = seededRandom(`session:${symbol}`);
  const drift = (random() - 0.5) * volatility * 0.32;
  let price = open;
  return Array.from({ length: 24 }, () => {
    price = walkStep(price, volatility, random, drift);
    return roundPrice(price, precision);
  });
}
