// Phase 65 step 4: build the Avastuskaart boundary layers for Latvia and
// Lithuania, the same way rebuild_boundaries.mjs builds Estonia's.
//
//   node scripts/fetch_country_osm.mjs          # fills .osm-cache/
//   node scripts/rebuild_boundaries_country.mjs
//
// Writes, per country:
//   public/municipalities_<cc>.geojson   level-2 outlines (properties: id, maakond_id, name, bbox)
//   public/regions_<cc>.geojson          level-1 outlines, dissolved from the above
//
// The level-1 layer is DISSOLVED from the level-2 one rather than fetched
// separately, which is what makes the two layers share exact border lines
// (Latvia has no level-1 boundary in OSM at all, so there is nothing to fetch).
// Simplification runs through mapshaper with topology preserved, so adjacent
// municipalities keep a single shared line instead of a doubled seam.
//
// Requires: npx mapshaper (downloaded on first run). Reads no database —
// region names and ids come from scripts/_lib/regions.mjs, the same
// source the DB seed uses, so the geojson and the catalog cannot drift.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegionTree } from './_lib/regions.mjs';
import { cleanGeom, bboxOf, geometryFromRings } from './_lib/geojson.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const pub = join(repo, 'public');
mkdirSync(pub, { recursive: true });

const args = process.argv.slice(2).map((s) => s.toUpperCase());
const COUNTRIES = args.length ? args : ['LV', 'LT'];

for (const cc of COUNTRIES) {
  console.log(`\n=== ${cc} ===`);
  const { municipalities, level1 } = loadRegionTree(cc);
  const l1Name = new Map(level1.map((r) => [r.id, r.name]));

  const labeled = {
    type: 'FeatureCollection',
    features: municipalities.map((m) => ({
      type: 'Feature',
      properties: { id: m.id, maakond_id: m.regionId, name: m.name },
      geometry: geometryFromRings(m.rings),
    })),
  };
  console.log(`  ${labeled.features.length} municipalities in ${level1.length} regions`);

  const tLabeled = join(pub, `.bb_${cc}_labeled.geojson`);
  const tL2 = join(pub, `.bb_${cc}_l2.geojson`);
  const tL1 = join(pub, `.bb_${cc}_l1.geojson`);
  writeFileSync(tLabeled, JSON.stringify(labeled));

  // Same knobs as the Estonian pipeline: 25% topology-preserving simplify,
  // keep-shapes so nothing is dropped, 0.001° coordinate precision.
  execFileSync('npx', ['-y', 'mapshaper', tLabeled, '-simplify', '25%', 'keep-shapes', '-o', tL2, 'precision=0.001', 'format=geojson'], { stdio: 'inherit' });
  execFileSync('npx', ['-y', 'mapshaper', tL2, '-dissolve', 'maakond_id', '-o', tL1, 'precision=0.001', 'format=geojson'], { stdio: 'inherit' });

  const l2Out = JSON.parse(readFileSync(tL2, 'utf8')).features
    .map((f) => {
      const geometry = cleanGeom(f.geometry);
      return { type: 'Feature', properties: { id: f.properties.id, maakond_id: f.properties.maakond_id, name: f.properties.name, bbox: bboxOf(geometry) }, geometry };
    })
    .sort((a, b) => a.properties.id - b.properties.id);
  writeFileSync(join(pub, `municipalities_${cc.toLowerCase()}.geojson`), JSON.stringify({ type: 'FeatureCollection', features: l2Out }));

  const l1Out = JSON.parse(readFileSync(tL1, 'utf8')).features
    .map((f) => {
      const geometry = cleanGeom(f.geometry, true);
      const id = f.properties.maakond_id;
      return { type: 'Feature', properties: { id, name: l1Name.get(id) ?? String(id), bbox: bboxOf(geometry) }, geometry };
    })
    .sort((a, b) => a.properties.id - b.properties.id);
  writeFileSync(join(pub, `regions_${cc.toLowerCase()}.geojson`), JSON.stringify({ type: 'FeatureCollection', features: l1Out }));

  for (const t of [tLabeled, tL2, tL1]) rmSync(t, { force: true });

  if (l1Out.length !== level1.length) {
    throw new Error(`${cc}: dissolve produced ${l1Out.length} regions, expected ${level1.length}`);
  }
  const kb = (p) => Math.round(readFileSync(p).length / 1024);
  console.log(`  wrote municipalities_${cc.toLowerCase()}.geojson (${l2Out.length}, ${kb(join(pub, `municipalities_${cc.toLowerCase()}.geojson`))} KB)`);
  console.log(`  wrote regions_${cc.toLowerCase()}.geojson (${l1Out.length}, ${kb(join(pub, `regions_${cc.toLowerCase()}.geojson`))} KB)`);
}
