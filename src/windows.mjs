// Local-time sending windows for a daily outreach queue.
//
// Each country gets its own morning window in ITS time zone (default 07:00-08:00), so a
// request lands when people there open the app. Daylight-saving changes are handled per
// zone through Intl (IANA zones), so a Dubai window and a Dublin window stay correct all
// year even though the server runs on Madrid time.
//
// Pacing rules:
//   - never two actions closer than MIN_GAP_S seconds,
//   - the spare time is spread at random between the start and the gaps (human rhythm),
//   - whatever does not fit in the window is NOT sent late: it stays queued for tomorrow.

export const DEFAULT_WINDOWS = {
  IE: { tz: 'Europe/Dublin', from: '07:00', to: '08:00' },
  AE: { tz: 'Asia/Dubai', from: '07:00', to: '08:00' },
  ES: { tz: 'Europe/Madrid', from: '07:00', to: '08:00' },
};
export const MIN_GAP_S = 75;
const START_AFTER_RESTART_S = 60; // if the window already started, wait a minute before the first one
const END_MARGIN_MS = 30_000;     // the last one at least 30 s before the window closes

const cache = new Map();
function formatter(tz) {
  if (!cache.has(tz)) {
    cache.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return cache.get(tz);
}
function parts(tz, ms) {
  const p = {};
  for (const x of formatter(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return p;
}

/** Minutes the clock of `tz` is ahead of UTC at instant `ms`. */
export function offsetMinutes(tz, ms) {
  const p = parts(tz, ms);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** The instant (ms) at which the clock of `tz` shows date `YYYY-MM-DD` and time `HH:MM`. */
export function localInstant(tz, isoDate, hhmm) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const base = Date.UTC(y, m - 1, d, h, mi);
  let ms = base - offsetMinutes(tz, base) * 60000;
  ms = base - offsetMinutes(tz, ms) * 60000; // second pass, in case a DST change falls in between
  return ms;
}

export const dateIn = (tz, ms) => { const p = parts(tz, ms); return `${p.year}-${p.month}-${p.day}`; };
export const timeIn = (tz, ms) => { const p = parts(tz, ms); return `${p.hour}:${p.minute}`; };

/** Today's window (server calendar day) for a country, or null if it has none. */
export function windowFor(country, nowMs, { windows = DEFAULT_WINDOWS, serverTz = 'Europe/Madrid' } = {}) {
  const w = windows[country];
  if (!w) return null;
  const day = dateIn(serverTz, nowMs);
  return { country, tz: w.tz, day, start: localInstant(w.tz, day, w.from), end: localInstant(w.tz, day, w.to) };
}

/**
 * Plan the day. Returns { plan: [{ item, country, at }], deferred: [{ item, reason }] }.
 * `items` is the queue in priority order, each with a `country`.
 */
export function planDay(items, nowMs, { windows = DEFAULT_WINDOWS, serverTz = 'Europe/Madrid', random = Math.random, minGapS = MIN_GAP_S } = {}) {
  const gap = minGapS * 1000;
  const byCountry = new Map();
  for (const it of items) {
    if (!byCountry.has(it.country)) byCountry.set(it.country, []);
    byCountry.get(it.country).push(it);
  }
  let plan = [];
  const deferred = [];
  for (const [country, list] of byCountry) {
    const w = windowFor(country, nowMs, { windows, serverTz });
    if (!w) { list.forEach((item) => deferred.push({ item, reason: 'no window for this country' })); continue; }
    const from = Math.max(w.start, nowMs + START_AFTER_RESTART_S * 1000);
    const length = (w.end - END_MARGIN_MS) - from;
    const fits = length > 0 ? Math.floor(length / gap) : 0;
    if (fits <= 0) {
      const reason = nowMs >= w.end ? 'window already over' : 'no time left in the window';
      list.forEach((item) => deferred.push({ item, reason }));
      continue;
    }
    const go = list.slice(0, fits);
    list.slice(fits).forEach((item) => deferred.push({ item, reason: 'does not fit in the window' }));
    // spread the spare time at random: one weight for the start, one per gap, one for the tail
    const spare = length - go.length * gap;
    const weights = Array.from({ length: go.length + 1 }, () => 0.25 + random());
    const sum = weights.reduce((a, b) => a + b, 0);
    let t = from + (spare * weights[0]) / sum;
    go.forEach((item, i) => {
      if (i > 0) t += gap + (spare * weights[i]) / sum;
      plan.push({ item, country, at: Math.round(t), window: w });
    });
  }
  plan.sort((a, b) => a.at - b.at);
  // overlapping windows of two countries: still never two actions closer than the minimum gap
  for (let i = 1; i < plan.length; i++) if (plan[i].at - plan[i - 1].at < gap) plan[i].at = plan[i - 1].at + gap;
  const kept = [];
  for (const p of plan) {
    if (p.at > p.window.end - END_MARGIN_MS) deferred.push({ item: p.item, reason: 'does not fit in the window' });
    else kept.push(p);
  }
  plan = kept.map(({ window, ...rest }) => rest);
  return { plan, deferred };
}
