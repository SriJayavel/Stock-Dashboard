const dayMs = 86400000;
const istOffsetMs = 330 * 60000;
const indiaHolidays = '01-26 03-03 03-26 03-31 04-03 04-14 05-01 05-28 06-26 09-14 10-02 10-20 11-10 11-24 12-25';

const exchanges = [
  { name: 'NSE / BSE', zone: 'Asia/Kolkata', hours: [[555, 930]], holidays: indiaHolidays },
  { name: 'NYSE', zone: 'America/New_York', hours: [[570, 960]], holidays: '01-01 01-19 02-16 04-03 05-25 06-19 07-03 09-07 11-26 12-25', halfDays: '11-27 12-24', halfClose: 780 },
  { name: 'LSE', zone: 'Europe/London', hours: [[480, 990]], holidays: '01-01 04-03 04-06 05-04 05-25 08-31 12-25 12-28', halfDays: '12-24 12-31', halfClose: 750 },
  { name: 'TYO', zone: 'Asia/Tokyo', hours: [[540, 690], [750, 930]], holidays: '01-01 01-02 01-12 02-11 02-23 03-20 04-29 05-04 05-05 05-06 07-20 08-11 09-21 09-22 09-23 10-12 11-03 11-23 12-31' },
].map(exchange => ({
  ...exchange,
  localClock: new Intl.DateTimeFormat('en-GB', {
    timeZone: exchange.zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }),
}));

function localParts(format, time) {
  return Object.fromEntries(format.formatToParts(time).map(({ type, value }) => [type, Number(value)]));
}

function wallTimeToInstant(format, date, minute) {
  const wall = date + minute * 60000;
  const offsetAt = instant => {
    const local = localParts(format, instant);
    return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - instant;
  };
  const estimate = wall - offsetAt(wall);
  return wall - offsetAt(estimate);
}

export function marketSessions(now = Date.now()) {
  const start = Math.floor((now + istOffsetMs) / dayMs) * dayMs - istOffsetMs;
  const end = start + dayMs;
  const markets = exchanges.map(exchange => {
    const local = localParts(exchange.localClock, start);
    const firstDate = Date.UTC(local.year, local.month - 1, local.day);
    const sessions = [];
    let state = 'Closed';
    for (const date of [firstDate, firstDate + dayMs]) {
      const instant = new Date(date);
      const day = instant.getUTCDay();
      const dateKey = instant.toISOString().slice(5, 10);
      const knownCalendar = instant.getUTCFullYear() === 2026;
      const holiday = knownCalendar && exchange.holidays.split(' ').includes(dateKey);
      const isCurrentDate = wallTimeToInstant(exchange.localClock, date, 0) <= now
        && now < wallTimeToInstant(exchange.localClock, date + dayMs, 0);
      if (holiday || day === 0 || day === 6) {
        if (isCurrentDate) state = holiday ? 'Holiday' : 'Weekend';
        continue;
      }
      const halfDay = knownCalendar && exchange.halfDays?.split(' ').includes(dateKey);
      for (const [open, close] of exchange.hours) {
        const from = wallTimeToInstant(exchange.localClock, date, open);
        const to = wallTimeToInstant(exchange.localClock, date, halfDay ? exchange.halfClose : close);
        if (from <= now && now < to) state = knownCalendar ? 'Scheduled open' : 'Regular hours';
        if (from >= end || to <= start) continue;
        sessions.push({
          from: (Math.max(start, from) - start) / dayMs * 100,
          to: (Math.min(end, to) - start) / dayMs * 100,
          open: from,
          close: to,
        });
      }
    }
    return { name: exchange.name, sessions, state };
  });
  return { markets, nowPosition: (now - start) / dayMs * 100 };
}
