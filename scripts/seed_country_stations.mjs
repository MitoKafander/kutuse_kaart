// Phase 65 step 3: seed the full Latvian and Lithuanian station catalogs from
// OpenStreetMap.
//
//   node scripts/fetch_country_osm.mjs             # fills .osm-cache/
//   node scripts/seed_country_regions.mjs          # parishes must exist (FK)
//   node scripts/seed_country_stations.mjs --dry-run
//   node scripts/seed_country_stations.mjs
//
// Idempotent by PROXIMITY, not by coordinate equality: an OSM point within
// MATCH_METRES of a station already in the DB is treated as that station and
// left alone. Latvia already holds 75 border-strip rows from
// seed_latvia_border.js, and OSM will have nudged some of those coordinates by
// a few metres since — matching on exact (lat, lng) would duplicate every one
// of them onto the map.
//
// Exclusions mirror the Estonian catalog's scope decisions:
//   · access=private            fleet/company depots
//   · CNG/CBG/LNG/H2/EV-only    out of scope (Elenger declined; Notes/Plan_CNG_CBG_Stations.md)
//   · shop=gas with no fuel:*   an Alexela-at-Coop-style bottled-gas cabinet
// LPG is NOT excluded — it's one of the four fuel types Kyts tracks.

import { sb, fetchAll, chunk } from './_lib/db.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, pointInRings } from './_lib/overpass.mjs';
import { loadRegionTree } from './_lib/regions.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const wanted = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());
const COUNTRIES = wanted.length ? wanted : ['LV', 'LT'];

/** Two OSM points closer than this are the same forecourt. */
const MATCH_METRES = 120;

// sb / fetchAll / chunk come from _lib/db.mjs — one definition of the
// 1000-row paging every script needs.

function metresBetween(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const lat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const x = dLon * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * R;
}

/** Why this OSM element is out of scope, or null to keep it. */
function excludeReason(tags) {
  if (tags.access === 'private' || tags.access === 'no') return 'private/fleet depot';
  const fuelKeys = Object.keys(tags).filter((k) => k.startsWith('fuel:') && tags[k] !== 'no');
  const liquidOrLpg = fuelKeys.some((k) => !/cng|biogas|lng|hydrogen|electricity|methane/.test(k));
  if (fuelKeys.length > 0 && !liquidOrLpg) return 'gas/electric only';
  if (tags.shop === 'gas' && fuelKeys.length === 0) return 'bottled-gas cabinet';
  return null;
}

let grandNew = 0;
for (const cc of COUNTRIES) {
  console.log(`\n=== ${cc} ===`);
  const raw = JSON.parse(readFileSync(join(CACHE_DIR, `${cc}_fuel.json`), 'utf8'));
  const { municipalities } = loadRegionTree(cc);

  const excluded = {};
  const candidates = [];
  for (const el of raw.elements) {
    const tags = el.tags || {};
    if (tags.amenity !== 'fuel') continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) { excluded['no coordinates'] = (excluded['no coordinates'] || 0) + 1; continue; }
    const reason = excludeReason(tags);
    if (reason) { excluded[reason] = (excluded[reason] || 0) + 1; continue; }
    candidates.push({
      // Same precedence as seed_latvia_border.js — getBrand() reads this field.
      name: tags.brand || tags.name || tags.operator || 'Tundmatu',
      latitude: lat,
      longitude: lon,
      amenities: tags,
      country: cc,
      parish_id: municipalities.find((m) => pointInRings(lon, lat, m.rings))?.id ?? null,
    });
  }
  console.log(`  OSM: ${raw.elements.length} fuel features -> ${candidates.length} in scope`);
  for (const [reason, n] of Object.entries(excluded)) console.log(`    excluded ${n} (${reason})`);

  // Dedupe against what's already there. Compare against EVERY country's rows,
  // not just this one: a border station could already be filed under its
  // neighbour, and inserting a second copy would put two dots on one forecourt.
  const existing = await fetchAll('stations', 'id, name, latitude, longitude, country, active');
  const fresh = [];
  const matched = [];
  for (const c of candidates) {
    const near = existing.find(
      (e) => metresBetween(c.latitude, c.longitude, Number(e.latitude), Number(e.longitude)) <= MATCH_METRES,
    );
    if (near) matched.push({ candidate: c, existing: near });
    else fresh.push(c);
  }
  // Two OSM points within MATCH_METRES of each other (a way and its node, a
  // forecourt mapped twice) must not both be inserted either.
  const deduped = [];
  for (const c of fresh) {
    if (deduped.some((d) => metresBetween(c.latitude, c.longitude, d.latitude, d.longitude) <= MATCH_METRES)) continue;
    deduped.push(c);
  }

  const crossCountry = matched.filter((m) => m.existing.country !== cc);
  console.log(`  already in DB: ${matched.length}${crossCountry.length ? ` (${crossCountry.length} filed under another country)` : ''}`);
  console.log(`  new: ${deduped.length}${fresh.length - deduped.length ? ` (+${fresh.length - deduped.length} collapsed as same-forecourt duplicates)` : ''}`);
  const noParish = deduped.filter((d) => d.parish_id == null).length;
  if (noParish) console.log(`    ${noParish} new station(s) fall outside every municipality boundary (parish_id NULL)`);

  const brands = {};
  for (const d of deduped) brands[d.name] = (brands[d.name] || 0) + 1;
  console.log('  top new brands: ' + Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}×${v}`).join(', '));

  if (DRY_RUN) { console.log('  --dry-run: nothing written.'); continue; }
  if (!deduped.length) { console.log('  nothing to insert.'); continue; }

  let inserted = 0;
  for (const part of chunk(deduped, 100)) {
    const { error } = await sb.from('stations').insert(part);
    if (error) throw new Error(`${cc} insert: ${error.message}`);
    inserted += part.length;
    console.log(`    …${inserted}/${deduped.length}`);
  }
  grandNew += inserted;
  console.log(`  inserted ${inserted} station(s)`);
}

console.log(`\nDone — ${grandNew} new station(s). Verify with: node scripts/verify_countries.mjs`);
