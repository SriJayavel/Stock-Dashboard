/**
 * Render a small inline chart from measured values. Missing samples produce no chart.
 * @param {number[] | undefined} values
 * @param {boolean} [fillArea]
 * @returns {string}
 */
export function sparklineSvg(values, fillArea = false) {
  if (!values || values.length < 2 || values.some((value) => !Number.isFinite(value))) return '';
  const shown = values.length > 30
    ? Array.from({ length: 30 }, (_, index) => values[Math.round(index * (values.length - 1) / 29)])
    : values;
  const lo = Math.min(...shown);
  const span = Math.max(...shown) - lo;
  const points = shown.map((price, index) => {
    const x = 2 + 92 * index / (shown.length - 1);
    const y = span ? 22 - 20 * (price - lo) / span : 12;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const trend = shown.at(-1) > shown[0] ? 'gain' : shown.at(-1) < shown[0] ? 'loss' : 'flat';
  const area = fillArea ? `<polygon fill="currentColor" fill-opacity=".035" points="2,24 ${points} 94,24"/>` : '';
  return `<svg class="benchmark-sparkline ${trend}" width="96" height="24" viewBox="0 0 96 24" aria-hidden="true" preserveAspectRatio="none">${area}<polyline fill="none" stroke="currentColor" stroke-width="1.25" points="${points}"/></svg>`;
}
