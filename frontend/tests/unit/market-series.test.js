import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intradaySeries, seededRandom } from '../../src/demo/simulator.js';
import { sparklineSvg } from '../../src/sparkline.js';

test('intraday samples are deterministic and differ per symbol', () => {
  const samples = intradaySeries('NIFTY', 24850, .003);
  assert.deepEqual(samples, intradaySeries('NIFTY', 24850, .003));
  assert.notDeepEqual(samples, intradaySeries('SENSEX', 24850, .003));
  assert.equal(samples.length, 24);
  assert.equal(samples.every((price) => price > 0 && Number.isFinite(price)), true);
  const random = seededRandom('NIFTY');
  assert.equal(Array.from({ length: 100 }, random).every((value) => value >= 0 && value < 1), true);
});

test('sparkline handles missing, rising, falling and flat series', () => {
  assert.equal(sparklineSvg(), '');
  assert.equal(sparklineSvg([5, NaN]), '');
  assert.match(sparklineSvg([5, 8]), /gain.*points="2\.0,22\.0 94\.0,2\.0"/);
  assert.match(sparklineSvg([8, 5]), /loss.*points="2\.0,2\.0 94\.0,22\.0"/);
  assert.match(sparklineSvg([5, 5]), /flat.*points="2\.0,12\.0 94\.0,12\.0"/);
  assert.equal(sparklineSvg(Array.from({ length: 80 }, (_, index) => index))
    .match(/points="([^"]+)"/)[1].split(' ').length, 30);
});
