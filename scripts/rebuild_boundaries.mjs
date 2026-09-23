// Rebuild BOTH boundary layers (public/parishes.geojson + public/maakonnad.geojson)
// from current OpenStreetMap municipality boundaries, so that adjacent valds share
// the EXACT same border line (single line, no "double dashed / no-man's-land").
//
// Why OSM: the previously-shipped geojsons were simplified per-polygon, so neighbours'
// shared borders were digitised independently and only ~26% of vald-vald edges coincided
// -> doubled lines. OSM admin_level=7 boundaries are made of shared ways, so adjacent
// municipalities reference the same vertices -> topology is correct by construction
// (verified: 11/12 landlocked municipalities show 100% shared edges).
//
// The app joins each geojson feature to its DB row by properties.id, which IS the OSM
// relation id (verified: all 78 parish ids === osm_id). Avastuskaart counting is DB-side
// (parishes.station_count + stations.parish_id), so swapping geometry changes only what's
// drawn — totals are untouched. Estonia currently has 78 municipalities (Toila vald merged
// into Jõhvi vald on 2025-11-28), matching the app's 78 parishes exactly.
//
// ── Source acquisition (run once, produces the raw OSM file) ────────────────────────────
//   1. POST this to https://overpass-api.de/api/interpreter (the ["EHAK:code"] tag filters
//      out the Latvian border muni "Valka"; Toila is added explicitly as its area lagged):
//        [out:json][timeout:300];
//        area["ISO3166-1"="EE"][admin_level=2]->.ee;
//        ( relation(area.ee)["admin_level"="7"]["boundary"="administrative"]["EHAK:code"];
//          relation["admin_level"="7"]["boundary"="administrative"]["name"="Toila vald"]; )->.muns;
//        .muns out body; way(r.muns); out geom;
//   2. Assemble ways -> polygons:
//        node scripts/osm_assemble_boundaries.cjs <overpass_out.json> /tmp/ee_municipalities.geojson
//   3. node scripts/rebuild_boundaries.mjs /tmp/ee_municipalities.geojson
//
// Requires npx mapshaper + service-role .env. Run from repo root.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
// Shared with rebuild_boundaries_baltic.mjs so "what counts as a degenerate ring"
// has one definition across both boundary builders (phase 65).
import { cleanGeom, bboxOf } from './_lib/geojson.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
dotenv.config({ path: join(repo, '.env') });
const pub = join(repo, 'public');
const SRC = process.argv[2] || '/tmp/geofix/ee_municipalities_current.geojson';

const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: dbPar } = await sb.from('parishes').select('id, maakond_id, name');
const { data: dbMk } = await sb.from('maakonnad').select('id, name');
if (!dbPar?.length || !dbMk?.length) throw new Error('DB read failed');
const parById = new Map(dbPar.map((p) => [p.id, p]));
const mkName = new Map(dbMk.map((m) => [m.id, m.name]));

// Join OSM geometry to DB parishes by osm_id (== parish id). Every DB parish must match.
const osm = JSON.parse(readFileSync(SRC, 'utf8'));
const labeled = { type: 'FeatureCollection', features: [] };
const matched = new Set();
for (const f of osm.features) {
  const p = parById.get(f.properties.osm_id);
  if (!p) continue; // OSM unit not tracked by the app (none expected today)
  matched.add(p.id);
  labeled.features.push({ type: 'Feature', properties: { id: p.id, maakond_id: p.maakond_id, name: p.name }, geometry: f.geometry });
}
const missing = dbPar.filter((p) => !matched.has(p.id));
if (missing.length) throw new Error(`Unmatched DB parishes (no OSM geometry): ${missing.map((m) => `${m.id} ${m.name}`).join(', ')}`);

// mapshaper: topology-preserving simplify (shared arcs simplify identically -> stay single
// lines); keep-shapes so no municipality is dropped; then dissolve to counties.
const tLabeled = join(pub, '.boundaries_labeled.geojson');
const tPar = join(pub, '.boundaries_par.geojson');
const tMk = join(pub, '.boundaries_mk.geojson');
writeFileSync(tLabeled, JSON.stringify(labeled));
execFileSync('npx', ['mapshaper', tLabeled, '-simplify', '25%', 'keep-shapes', '-o', tPar, 'precision=0.001', 'format=geojson'], { stdio: 'inherit' });
execFileSync('npx', ['mapshaper', tPar, '-dissolve', 'maakond_id', '-o', tMk, 'precision=0.001', 'format=geojson'], { stdio: 'inherit' });

const parOut = JSON.parse(readFileSync(tPar, 'utf8')).features
  .map((f) => { const geometry = cleanGeom(f.geometry); return { type: 'Feature', properties: { id: f.properties.id, maakond_id: f.properties.maakond_id, name: f.properties.name, bbox: bboxOf(geometry) }, geometry }; })
  .sort((a, b) => a.properties.id - b.properties.id);
writeFileSync(join(pub, 'parishes.geojson'), JSON.stringify({ type: 'FeatureCollection', features: parOut }));

const mkOut = JSON.parse(readFileSync(tMk, 'utf8')).features
  .map((f) => { const geometry = cleanGeom(f.geometry, true); return { type: 'Feature', properties: { id: f.properties.maakond_id, name: mkName.get(f.properties.maakond_id) ?? String(f.properties.maakond_id), bbox: bboxOf(geometry) }, geometry }; })
  .sort((a, b) => a.properties.id - b.properties.id);
writeFileSync(join(pub, 'maakonnad.geojson'), JSON.stringify({ type: 'FeatureCollection', features: mkOut }));

for (const t of [tLabeled, tPar, tMk]) rmSync(t, { force: true });
console.log(`Wrote public/parishes.geojson (${parOut.length}) + public/maakonnad.geojson (${mkOut.length})`);
