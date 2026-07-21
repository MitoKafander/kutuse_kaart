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

const round = (n) => Math.round(n * 1000) / 1000;

// Drop degenerate rings (a tiny islet can collapse into a zero-area self-retracing
// sliver during simplification — OGC-invalid). Epsilon is far below any real islet
// (~1 ha ≈ 5e-7 deg²), so only truly degenerate rings are removed.
const RING_EPS = 1e-10;
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
// dropAllHoles: counties (maakonnad) have NO legitimate interior holes — a maakond is a
// solid region and its enclosed linnad dissolve into it — so any hole is a dissolve
// artifact (pinhole sliver where parish vertices didn't perfectly coincide). Parishes DO
// have real holes (e.g. Rapla vald wraps Rapla linn), so there we only drop degenerate rings.
const cleanGeom = (geom, dropAllHoles = false) => {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  const kept = [];
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer || outer.length < 4 || ringArea(outer) < RING_EPS) continue; // drop degenerate part
    const holes = dropAllHoles ? [] : poly.slice(1).filter((h) => h.length >= 4 && ringArea(h) >= RING_EPS);
    kept.push([outer, ...holes]);
  }
  if (!kept.length) return geom; // never nuke a whole feature (shouldn't happen)
  return kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept };
};

const bboxOf = (geom) => {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      c[0] = round(c[0]); c[1] = round(c[1]);
      if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1];
      if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1];
    } else c.forEach(walk);
  };
  walk(geom.coordinates);
  return b;
};

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
