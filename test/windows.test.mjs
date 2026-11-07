import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDay, localInstant, timeIn } from '../src/windows.mjs';

const queue = (country, n) => Array.from({ length: n }, (_, i) => ({ name: `${country}${i}`, country }));
const madrid = (iso) => new Date(iso).getTime();

for (const day of ['2026-11-09', '2027-03-28', '2027-07-15', '2027-10-31']) {
  test(`${day}: every action inside its local 07:00-08:00 window, never closer than 75 s`, () => {
    for (let k = 0; k < 100; k++) {
      const start = localInstant('Europe/Madrid', day, '03:40');
      const { plan, deferred } = planDay([...queue('IE', 15), ...queue('AE', 15)], start);
      assert.equal(plan.length, 30);
      assert.equal(deferred.length, 0);
      for (const p of plan) {
        const tz = p.country === 'IE' ? 'Europe/Dublin' : 'Asia/Dubai';
        const t = timeIn(tz, p.at);
        assert.ok(t >= '07:00' && t < '08:00', `${p.item.name} at ${t} local`);
      }
      for (let i = 1; i < plan.length; i++) assert.ok(plan[i].at - plan[i - 1].at >= 75_000);
    }
  });
}

test('Dubai has no daylight saving: its window moves one hour in Madrid time between winter and summer', () => {
  const winter = planDay(queue('AE', 1), madrid('2027-01-10T03:40:00+01:00'), { random: () => 0 }).plan[0].at;
  const summer = planDay(queue('AE', 1), madrid('2027-07-10T03:40:00+02:00'), { random: () => 0 }).plan[0].at;
  assert.equal(timeIn('Europe/Madrid', winter).slice(0, 2), '04');
  assert.equal(timeIn('Europe/Madrid', summer).slice(0, 2), '05');
});

test('started late: what no longer fits is kept for tomorrow, never sent out of hours', () => {
  const late = madrid('2026-11-09T08:45:00+01:00'); // Dublin window is 08:00-09:00 Madrid time
  const { plan, deferred } = planDay(queue('IE', 15), late);
  assert.ok(plan.length > 0 && plan.length < 15);
  assert.equal(plan.length + deferred.length, 15);
  for (const p of plan) assert.ok(timeIn('Europe/Dublin', p.at) < '08:00');
});

test('a country without a window is never scheduled', () => {
  const { plan, deferred } = planDay(queue('CA', 3), madrid('2026-11-09T03:40:00+01:00'));
  assert.equal(plan.length, 0);
  assert.equal(deferred[0].reason, 'no window for this country');
});
