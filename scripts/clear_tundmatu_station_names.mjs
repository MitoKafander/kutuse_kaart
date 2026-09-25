// One-off, idempotent: clear the Estonian display sentinel out of stations.name.
//
// seed_country_stations.mjs used to write the literal 'Tundmatu' ("unknown")
// when OSM had no brand, name or operator for a forecourt — `stations.name` is
// NOT NULL, so it needed *something*. That put an Estonian word into the data
// of 146 Latvian, Lithuanian and Finnish stations, where no locale could
// translate it: it reached screen readers through the map dot's aria-label,
// and it sat in the search index, so "tundmatu" returned 146 foreign stations.
// Estonia has none — every Estonian station is named.
//
// The client already treats a falsy name as unknown (`getBrand` returns the
// sentinel, `getStationDisplayName` falls back to the OSM node name, the
// operator, then a *translated* label), so an empty string is the honest
// representation and the seeder now writes that.
//
//   node scripts/clear_tundmatu_station_names.mjs --dry-run
//   node scripts/clear_tundmatu_station_names.mjs

import { sb, fetchAll, chunk } from './_lib/db.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

const rows = await fetchAll('stations', 'id, name, country', (q) => q.eq('name', 'Tundmatu'));
if (!rows.length) {
  console.log('Nothing to do — no station is named "Tundmatu".');
  process.exit(0);
}

const byCountry = rows.reduce((a, r) => ({ ...a, [r.country]: (a[r.country] ?? 0) + 1 }), {});
console.log(`${rows.length} station(s) named "Tundmatu":`, byCountry);

if (DRY_RUN) {
  console.log('--dry-run: nothing written.');
  process.exit(0);
}

let done = 0;
for (const batch of chunk(rows.map((r) => r.id), 200)) {
  const { error } = await sb.from('stations').update({ name: '' }).in('id', batch);
  if (error) throw new Error(error.message);
  done += batch.length;
  console.log(`  cleared ${done}/${rows.length}`);
}
console.log('Done. Verify with: node scripts/verify_countries.mjs');
