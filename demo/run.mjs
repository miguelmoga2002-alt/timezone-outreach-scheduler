// Demo: plan tomorrow for a fictional queue of 15 contacts in Dublin and 15 in Dubai,
// as the scheduled task would when it starts at 03:40 server time (Madrid).
import { planDay, timeIn, dateIn } from '../src/windows.mjs';

const SERVER_TZ = 'Europe/Madrid';
const queue = [];
for (let i = 1; i <= 15; i++) queue.push({ name: `Dublin contact ${i}`, country: 'IE' });
for (let i = 1; i <= 15; i++) queue.push({ name: `Dubai contact ${i}`, country: 'AE' });
queue.push({ name: 'Toronto contact 1', country: 'CA' }); // no window configured: stays queued

const day = process.argv[2] || '2026-11-09';
const start = new Date(`${day}T03:40:00+01:00`).getTime();
const { plan, deferred } = planDay(queue, start, { serverTz: SERVER_TZ });

console.log(`Plan for ${dateIn(SERVER_TZ, start)} (task starts 03:40 server time)\n`);
console.log('server  local   country  contact');
for (const p of plan) {
  const tz = p.country === 'IE' ? 'Europe/Dublin' : 'Asia/Dubai';
  console.log(`${timeIn(SERVER_TZ, p.at)}   ${timeIn(tz, p.at)}   ${p.country.padEnd(7)}  ${p.item.name}`);
}
const gaps = plan.slice(1).map((p, i) => (p.at - plan[i].at) / 1000);
console.log(`\n${plan.length} planned, shortest gap ${Math.round(Math.min(...gaps))} s`);
for (const d of deferred) console.log(`kept for tomorrow: ${d.item.name} (${d.reason})`);
