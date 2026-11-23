import assert from 'node:assert/strict';
import test from 'node:test';
import { marketSessions } from '../../src/market-sessions.js';

const readDay = date => marketSessions(Date.parse(date));

test('observes market holidays by exchange-local date', () => {
  const india = readDay('2026-11-24T06:00:00Z').markets[0];
  assert.equal(india.state, 'Holiday');
  assert.deepEqual(india.sessions, []);

  const tokyo = readDay('2026-11-25T03:00:00Z').markets.at(-1);
  assert.equal(tokyo.sessions.length, 2);
  assert.equal(tokyo.sessions[1].close, Date.parse('2026-11-25T06:30:00Z'));
});

test('handles NYSE daylight saving offsets and sessions crossing midnight IST', () => {
  const market = date => readDay(date).markets.find(exchange => exchange.name === 'NYSE');
  for (const [date, openHour] of [['2026-01-27', '14'], ['2026-06-23', '13']]) {
    const { sessions } = market(`${date}T16:00:00Z`);
    assert.equal(sessions[0].from, 0);
    assert.equal(sessions[1].open, Date.parse(`${date}T${openHour}:30:00Z`));
    assert.equal(sessions[1].to, 100);
  }
});
