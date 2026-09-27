// Read-only: what `kyts:cache:stations` weighs at the current catalog, in the
// 2-bytes-per-character accounting Safari and Firefox charge against their 5 MiB
// per-origin quota — and how many more stations fit. RUN THIS BEFORE ADDING A
// COUNTRY: a quota failure is silent and takes the celebration store and country
// preferences down with it, so the cache ceiling is the real limit on catalog size.
//
//   node scripts/cache_headroom.mjs

import { fetchAll } from './_lib/db.mjs';

const KEYS = ['addr:city','addr:district','addr:municipality','addr:place',
              'addr:street','addr:subdistrict','addr:village','alt_name','name','operator'];

const cacheable = (s) => {
  const amenities = {};
  if (s.amenities) for (const k of KEYS) if (s.amenities[k] != null) amenities[k] = s.amenities[k];
  return { id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude,
           country: s.country, parish_id: s.parish_id, active: s.active, amenities };
};

const rows = await fetchAll('stations', 'id, name, latitude, longitude, country, parish_id, active, amenities',
  (q) => q.eq('active', true));

const size = (list) => (JSON.stringify(list.map(cacheable)).length * 2) / 1048576;  // 2 bytes/char
const byCountry = {};
for (const r of rows) (byCountry[r.country] ??= []).push(r);

const all = size(rows);
const worst = Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length)[0];
const perStation = (JSON.stringify(rows.map(cacheable)).length * 2) / rows.length;

console.log(`${rows.length} active stations · ~${perStation.toFixed(0)} bytes each\n`);
console.log('The cache holds ONE country (since 2026-09-27), because the map draws one:');
for (const [cc, list] of Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length)) {
  const mib = size(list);
  console.log(`  ${cc}: ${String(list.length).padStart(5)} stations -> ${mib.toFixed(2)} MiB (${(100 * mib / 5).toFixed(0)}% of quota)`);
}
console.log(`\nWorst case is ${worst[0]} at ${size(worst[1]).toFixed(2)} MiB.`);
console.log(`Caching every country instead would be ${all.toFixed(2)} MiB (${(100 * all / 5).toFixed(0)}%) — what it used to do.`);

// What matters now is the biggest single country a new one could bring, not
// the running total.
const headroom = Math.floor((5 * 1048576 / 2) / (perStation / 2));
console.log(`\nA new country is affordable as long as IT ALONE fits: roughly ${headroom} stations`);
console.log('leaves nothing for prices, votes, the celebration store or country prefs, so treat');
console.log(`~${Math.floor(headroom * 0.6)} as the practical limit for one country.`);
