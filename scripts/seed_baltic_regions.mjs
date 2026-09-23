// Phase 65 step 2: seed the Avastuskaart region catalog for Latvia and
// Lithuania, then point every station in those countries at the municipality
// it stands in.
//
//   node scripts/fetch_baltic_osm.mjs           # must run first (fills .osm-cache/)
//   node scripts/seed_baltic_regions.mjs --dry-run
//   node scripts/seed_baltic_regions.mjs
//   node scripts/seed_baltic_regions.mjs LV     # one country
//
// Idempotent: re-running upserts the same ids (level-1 hand-allocated, level-2
// = OSM relation id) and recomputes every station's parish_id. Requires
// migrations/schema_phase65_baltic_countries.sql to have been applied — the
// `country` column on maakonnad/parishes is what keeps Estonia's catalog
// separate from these.
//
// Estonia is deliberately NOT touched by this script.

import { sb, fetchAll, chunk } from './_lib/db.mjs';
import { loadRegionTree } from './_lib/baltic_regions.mjs';
import { pointInRings } from './_lib/overpass.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const wanted = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());
const COUNTRIES = wanted.length ? wanted : ['LV', 'LT'];

// sb / fetchAll / chunk come from _lib/db.mjs — one definition of the
// 1000-row paging every script needs.

for (const cc of COUNTRIES) {
  console.log(`\n=== ${cc} ===`);
  const { municipalities, level1 } = loadRegionTree(cc);
  console.log(`  catalog: ${level1.length} level-1 regions, ${municipalities.length} municipalities`);

  const level2Rows = municipalities.map((m) => ({
    id: m.id,
    maakond_id: m.regionId,
    name: m.name,
    country: cc,
  }));

  // Sanity: ids must be unique and every level-2 must point at a level-1 we're
  // about to write, or the FK insert would half-apply.
  const l1ids = new Set(level1.map((r) => r.id));
  const orphan = level2Rows.filter((r) => !l1ids.has(r.maakond_id));
  if (orphan.length) throw new Error(`${cc}: ${orphan.length} municipalities point at an unseeded region`);
  if (new Set(level2Rows.map((r) => r.id)).size !== level2Rows.length) throw new Error(`${cc}: duplicate municipality ids`);

  // Which stations belong where — computed locally from the OSM geometry, so
  // the whole assignment is known before a single row is written.
  const stations = await fetchAll('stations', 'id, name, latitude, longitude, parish_id, active', (q) => q.eq('country', cc));
  console.log(`  stations in DB: ${stations.length}`);

  const assignments = [];
  let unplaced = 0;
  for (const s of stations) {
    const lon = Number(s.longitude);
    const lat = Number(s.latitude);
    const hit = municipalities.find((m) => pointInRings(lon, lat, m.rings));
    if (!hit) { unplaced++; continue; }
    if (s.parish_id !== hit.id) assignments.push({ id: s.id, parish_id: hit.id, name: s.name, to: hit.name });
  }
  console.log(`  parish_id: ${assignments.length} station(s) to (re)assign, ${unplaced} outside every municipality`);
  if (unplaced) {
    // Expected only for a coastal station whose coordinate sits just off the
    // digitised coastline. Worth a look if it's more than a handful.
    console.log(`    (a station outside every boundary keeps parish_id NULL and sits out the Avastuskaart)`);
  }

  if (DRY_RUN) {
    console.log('  --dry-run: nothing written.');
    console.log(`    would upsert ${level1.length} maakonnad + ${level2Rows.length} parishes`);
    for (const a of assignments.slice(0, 5)) console.log(`    would set ${a.name} -> ${a.to}`);
    continue;
  }

  const { error: e1 } = await sb.from('maakonnad').upsert(level1, { onConflict: 'id' });
  if (e1) throw new Error(`${cc} maakonnad: ${e1.message}`);
  console.log(`  upserted ${level1.length} maakonnad`);

  for (const part of chunk(level2Rows, 200)) {
    const { error } = await sb.from('parishes').upsert(part, { onConflict: 'id' });
    if (error) throw new Error(`${cc} parishes: ${error.message}`);
  }
  console.log(`  upserted ${level2Rows.length} parishes`);

  // One UPDATE per station: the phase-64 trigger keeps parishes.station_count
  // in step, and it only fires per row.
  let done = 0;
  for (const a of assignments) {
    const { error } = await sb.from('stations').update({ parish_id: a.parish_id }).eq('id', a.id);
    if (error) throw new Error(`station ${a.id}: ${error.message}`);
    if (++done % 100 === 0) console.log(`    …${done}/${assignments.length}`);
  }
  console.log(`  assigned ${done} station(s)`);
}

console.log('\nDone. Verify with: node scripts/verify_baltic_expansion.mjs');
