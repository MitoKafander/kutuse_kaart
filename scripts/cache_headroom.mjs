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
const CACHE_LIMIT = 1500;   // keep in step with CACHE_LIMIT in src/App.tsx

const byCountry = {};
for (const r of rows) (byCountry[r.country] ??= []).push(r);
const perStation = (JSON.stringify(rows.map(cacheable)).length * 2) / rows.length;

console.log(`${rows.length} active stations · ~${perStation.toFixed(0)} bytes each\n`);
console.log(`The cache keeps at most ${CACHE_LIMIT} stations — one country, nearest the`);
console.log('last map centre — so its cost is CONSTANT and catalogue size is no longer a');
console.log('ceiling. What follows is what each country would cost if it were uncapped,');
console.log('which is only useful for spotting how much the cap is doing:\n');

let capped = 0;
for (const [cc, list] of Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length)) {
  const full = size(list);
  const kept = Math.min(list.length, CACHE_LIMIT);
  const mark = list.length > CACHE_LIMIT ? `  -> capped to ${kept}` : '';
  if (list.length > CACHE_LIMIT) capped++;
  console.log(`  ${cc}: ${String(list.length).padStart(5)} stations, uncapped ${full.toFixed(2)} MiB (${(100 * full / 5).toFixed(0)}%)${mark}`);
}

const cappedMiB = (CACHE_LIMIT * perStation) / 1048576;
console.log(`\nActual worst case, any country: ~${cappedMiB.toFixed(2)} MiB (${(100 * cappedMiB / 5).toFixed(0)}% of the 5 MiB quota).`);
console.log(`${capped} of ${Object.keys(byCountry).length} countries are large enough for the cap to bite.`);
console.log('\nAdding a country no longer has a cache cost to check — it is bounded by');
console.log('construction. What still matters per country: the seed size itself, and');
console.log('whether prices/votes/celebration store are growing into the same quota.');
