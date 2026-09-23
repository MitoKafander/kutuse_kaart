// Phase 65 verification. Read-only — run it before AND after the seeds and
// compare, or just run it after and read the verdicts.
//
//   node scripts/verify_countries.mjs
//
// The question it exists to answer is not "did Latvia and Lithuania arrive"
// (that's visible on the map) but "is Estonia exactly as it was". Every EE
// check below is an invariant the expansion must not move.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function fetchAll(table, select, filter = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(sb.from(table).select(select)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// Estonia's shape as of phase 64, before any Baltic seeding.
const EE_BASELINE = { maakonnad: 15, parishes: 78 };

console.log('\n── catalog ──');
const stations = await fetchAll('stations', 'id, country, active, parish_id');
const parishes = await fetchAll('parishes', '*');
const maakonnad = await fetchAll('maakonnad', '*');

const hasCountryCol = parishes.length > 0 && 'country' in parishes[0];
check(hasCountryCol, 'parishes.country exists', hasCountryCol ? '' : 'migration schema_phase65 not applied yet');
const countryOf = (r) => r.country ?? 'EE';

for (const cc of ['EE', 'LV', 'LT']) {
  const st = stations.filter((s) => s.country === cc);
  const pa = parishes.filter((p) => countryOf(p) === cc);
  const mk = maakonnad.filter((m) => countryOf(m) === cc);
  console.log(`  ${cc}: ${st.filter((s) => s.active).length} active stations · ${mk.length} regions · ${pa.length} municipalities`);
}

console.log('\n── Estonia must be untouched ──');
const eeMk = maakonnad.filter((m) => countryOf(m) === 'EE');
const eePa = parishes.filter((p) => countryOf(p) === 'EE');
check(eeMk.length === EE_BASELINE.maakonnad, `EE has ${EE_BASELINE.maakonnad} maakonnad`, `got ${eeMk.length}`);
check(eePa.length === EE_BASELINE.parishes, `EE has ${EE_BASELINE.parishes} parishes`, `got ${eePa.length}`);

// The Avastuskaart denominator: parishes.station_count must equal the live
// active-station count for that parish, in every country (phase 64 invariant,
// now extended past EE).
const perParish = new Map();
for (const s of stations) {
  if (s.parish_id == null || !s.active) continue;
  perParish.set(s.parish_id, (perParish.get(s.parish_id) || 0) + 1);
}
const drift = parishes.filter((p) => (perParish.get(p.id) || 0) !== p.station_count);
check(drift.length === 0, 'parishes.station_count matches live active stations', drift.length
  ? drift.slice(0, 5).map((p) => `${p.name}: stored ${p.station_count} vs actual ${perParish.get(p.id) || 0}`).join('; ')
  : 'drift 0');

const mkDrift = maakonnad.filter((m) => {
  const sum = parishes.filter((p) => p.maakond_id === m.id).reduce((a, p) => a + p.station_count, 0);
  return sum !== m.station_count;
});
check(mkDrift.length === 0, 'maakonnad.station_count equals the sum of their parishes',
  mkDrift.length ? mkDrift.slice(0, 5).map((m) => m.name).join(', ') : 'drift 0');

// A station must never point at a parish in a different country, or an
// Estonian's badge grid would start counting Latvian forecourts.
const parishCountry = new Map(parishes.map((p) => [p.id, countryOf(p)]));
const crossed = stations.filter((s) => s.parish_id != null && parishCountry.get(s.parish_id) !== s.country);
check(crossed.length === 0, 'no station points at another country\'s municipality',
  crossed.length ? `${crossed.length} station(s)` : '');

console.log('\n── region ids stay in their allocated bands ──');
const band = { EE: [1, 99], LV: [101, 199], LT: [201, 299] };
const strayId = maakonnad.filter((m) => {
  const b = band[countryOf(m)];
  return !b || m.id < b[0] || m.id > b[1];
});
check(strayId.length === 0, 'every level-1 region id sits in its country\'s band',
  strayId.length ? strayId.map((m) => `${m.name}#${m.id}`).join(', ') : 'EE 1-99, LV 101-199, LT 201-299');

console.log('\n── prices ──');
const prices = await fetchAll('prices', 'id, station_id, fuel_type, price');
const stCountry = new Map(stations.map((s) => [String(s.id), s.country]));
const byCountry = {};
for (const p of prices) {
  const cc = stCountry.get(String(p.station_id)) ?? 'unknown';
  byCountry[cc] = (byCountry[cc] || 0) + 1;
}
console.log(`  prices by country: ${JSON.stringify(byCountry)}`);
const orphan = prices.filter((p) => !stCountry.has(String(p.station_id))).length;
check(orphan === 0, 'every price hangs off a known station', orphan ? `${orphan} orphaned` : '');

console.log('\n── boundary files match the catalog ──');
const { readFileSync, existsSync } = await import('node:fs');
for (const [cc, l1File, l2File] of [
  ['EE', 'public/maakonnad.geojson', 'public/parishes.geojson'],
  ['LV', 'public/regions_lv.geojson', 'public/municipalities_lv.geojson'],
  ['LT', 'public/regions_lt.geojson', 'public/municipalities_lt.geojson'],
]) {
  if (!existsSync(l2File)) { check(false, `${cc} boundary files exist`, `${l2File} missing`); continue; }
  const l1 = JSON.parse(readFileSync(l1File, 'utf8')).features;
  const l2 = JSON.parse(readFileSync(l2File, 'utf8')).features;
  const dbMk = maakonnad.filter((m) => countryOf(m) === cc);
  const dbPa = parishes.filter((p) => countryOf(p) === cc);
  if (!dbPa.length) { console.log(`  ${cc}: catalog not seeded yet, skipping`); continue; }
  const missing = dbPa.filter((p) => !l2.some((f) => f.properties.id === p.id));
  check(missing.length === 0 && l1.length === dbMk.length,
    `${cc}: ${l2.length} drawn municipalities / ${l1.length} regions line up with the catalog`,
    missing.length ? `${missing.length} municipality(ies) have no geometry` : '');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
