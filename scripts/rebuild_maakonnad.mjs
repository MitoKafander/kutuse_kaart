// Regenerate public/maakonnad.geojson as the DISSOLVED UNION of public/parishes.geojson.
//
// Why: the county (maakond) outlines shipped as an independently-digitised layer,
// so along every county border the solid blue maakond line and the dashed grey
// vald line did not coincide — two parallel lines with a gap ("eikellegimaa"),
// per user feedback 2026-07-16. Deriving the counties FROM the parishes makes the
// county border ride exactly on the vald outer edges (edge coincidence 11.8% -> ~87%).
//
// parishes.geojson is intentionally NOT modified: snapping the parishes enough to
// share arcs collapses ~2000 sub-130 m coastal islets (2285 -> 277 rings), which we
// must keep for the vald outlines. The snap used here only shapes the COUNTY layer,
// where those islets are invisible at country scale.
//
// Idempotent — safe to re-run. Requires `npx mapshaper` (auto-installed).
// Run from repo root: `node scripts/rebuild_maakonnad.mjs`
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'public');
const parishesPath = join(pub, 'parishes.geojson');
const maakonnadPath = join(pub, 'maakonnad.geojson');
const tmp = join(pub, '.maak_tmp.geojson');

// id -> name from the current maakonnad file (only the names are reused).
const nameById = new Map(
  JSON.parse(readFileSync(maakonnadPath, 'utf8')).features.map((f) => [f.properties.id, f.properties.name]),
);

// Dissolve parishes into one polygon per maakond_id (geometric union handles the
// tiny gaps/overlaps left by the per-polygon simplification of the source data).
execFileSync(
  'npx',
  ['mapshaper', parishesPath, 'snap-interval=0.0012', '-dissolve', 'maakond_id',
    '-o', tmp, 'precision=0.001', 'format=geojson'],
  { stdio: 'inherit' },
);

const round = (n) => Math.round(n * 1000) / 1000;
const raw = JSON.parse(readFileSync(tmp, 'utf8'));
const features = raw.features
  .map((f) => {
    const id = f.properties.maakond_id;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (c) => {
      if (typeof c[0] === 'number') {
        c[0] = round(c[0]); c[1] = round(c[1]);
        if (c[0] < minX) minX = c[0]; if (c[1] < minY) minY = c[1];
        if (c[0] > maxX) maxX = c[0]; if (c[1] > maxY) maxY = c[1];
      } else c.forEach(walk);
    };
    walk(f.geometry.coordinates);
    // Match the original property shape/order exactly: { id, name, bbox }.
    return {
      type: 'Feature',
      properties: { id, name: nameById.get(id) ?? String(id), bbox: [minX, minY, maxX, maxY] },
      geometry: f.geometry,
    };
  })
  .sort((a, b) => a.properties.id - b.properties.id);

writeFileSync(maakonnadPath, JSON.stringify({ type: 'FeatureCollection', features }));
rmSync(tmp, { force: true });
console.log(`Wrote ${maakonnadPath} — ${features.length} counties`);
