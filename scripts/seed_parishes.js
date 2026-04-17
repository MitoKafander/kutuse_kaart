// One-off seeder for Phase 29 (Avastuskaart). Fetches Estonia's maakonnad
// (admin_level=6) and parishes/linnad (admin_level=7) from OpenStreetMap via
// Overpass, stitches their outer ways into polygon rings, runs ray-casting
// point-in-polygon against every EE station in Supabase, and emits an
// idempotent SQL file: scripts/parishes_seed.sql. That SQL is committed next
// to the phase29 migration so Supabase branches can replay without Overpass.
//
// Usage:
//   node scripts/seed_parishes.js
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (the same env the
// existing seed_stations.js uses).

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

const OVERPASS_QUERY = `
[out:json][timeout:180];
area["ISO3166-1"="EE"][admin_level=2]->.ee;
(
  relation["admin_level"="6"](area.ee);
  relation["admin_level"="7"](area.ee);
);
out geom;
`;

// Keep maakond ids tight and stable (smallint on the DB side). Reseeds must
// produce the same id for a given name — we derive it from a sorted list.
const MAAKOND_EMOJI = {
  'Harju maakond':    '🏙️',
  'Hiiu maakond':     '🏝️',
  'Ida-Viru maakond': '🏭',
  'Jõgeva maakond':   '🌾',
  'Järva maakond':    '🌲',
  'Lääne maakond':    '🌊',
  'Lääne-Viru maakond': '🏰',
  'Põlva maakond':    '🌳',
  'Pärnu maakond':    '⛱️',
  'Rapla maakond':    '🐎',
  'Saare maakond':    '🏖️',
  'Tartu maakond':    '🎓',
  'Valga maakond':    '🌄',
  'Viljandi maakond': '🎭',
  'Võru maakond':     '🏞️',
};

function sameCoord(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

// Stitch outer ways into closed rings. Each input way is [[lon,lat], ...].
function stitchRings(ways) {
  const remaining = ways.map(w => w.slice());
  const rings = [];
  while (remaining.length) {
    let current = remaining.shift();
    let progress = true;
    while (progress) {
      progress = false;
      if (sameCoord(current[0], current[current.length - 1])) break;
      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        const cHead = current[0];
        const cTail = current[current.length - 1];
        const kHead = cand[0];
        const kTail = cand[cand.length - 1];
        if (sameCoord(cTail, kHead))      { current = current.concat(cand.slice(1));                         remaining.splice(i, 1); progress = true; break; }
        if (sameCoord(cTail, kTail))      { current = current.concat(cand.slice(0, -1).reverse());           remaining.splice(i, 1); progress = true; break; }
        if (sameCoord(cHead, kTail))      { current = cand.slice(0, -1).concat(current);                     remaining.splice(i, 1); progress = true; break; }
        if (sameCoord(cHead, kHead))      { current = cand.slice(1).reverse().concat(current);               remaining.splice(i, 1); progress = true; break; }
      }
    }
    rings.push(current);
  }
  return rings;
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const hit = ((yi > lat) !== (yj > lat))
      && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function pointInAnyRing(lon, lat, rings) {
  for (const r of rings) if (pointInRing(lon, lat, r)) return true;
  return false;
}

function ringCentroid(ring) {
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  return [sx / ring.length, sy / ring.length];
}

function sqlString(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

async function fetchOverpass() {
  // Overpass load-shed bursts are common — try each mirror up to 3× with
  // exponential backoff before giving up.
  const attempts = [];
  for (const url of OVERPASS_URLS) {
    for (let i = 0; i < 3; i++) {
      try {
        console.log(`Fetching Estonian admin boundaries from ${new URL(url).host} (attempt ${i + 1})…`);
        const res = await fetch(url, { method: 'POST', body: OVERPASS_QUERY });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
        return await res.json();
      } catch (e) {
        attempts.push(`${url}: ${e.message}`);
        const wait = 5000 * (i + 1);
        console.log(`  failed — waiting ${wait / 1000}s before retry`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw new Error(`Overpass unavailable after ${attempts.length} attempts:\n  ${attempts.join('\n  ')}`);
}

function parseRelations(overpassJson) {
  const regions = [];
  for (const el of overpassJson.elements) {
    if (el.type !== 'relation') continue;
    const level = Number(el.tags?.admin_level);
    if (level !== 6 && level !== 7) continue;
    const name = el.tags?.name;
    if (!name) continue;
    const outerWays = (el.members || [])
      .filter(m => m.type === 'way' && m.role === 'outer' && Array.isArray(m.geometry))
      .map(m => m.geometry.map(pt => [pt.lon, pt.lat]));
    if (!outerWays.length) continue;
    const rings = stitchRings(outerWays);
    regions.push({ id: el.id, name, level, rings });
  }
  return regions;
}

async function fetchStations() {
  console.log('Fetching EE stations from Supabase…');
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('stations')
      .select('id, latitude, longitude, country')
      .eq('country', 'EE')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function main() {
  return fetchOverpass().then(async (json) => {
    const regions = parseRelations(json);
    const maakonnad = regions.filter(r => r.level === 6);
    const parishes = regions.filter(r => r.level === 7);
    console.log(`Parsed ${maakonnad.length} maakonnad and ${parishes.length} parishes.`);

    // Assign each parish a maakond_id by testing its centroid against maakond rings.
    const sortedMaakonnad = [...maakonnad].sort((a, b) => a.name.localeCompare(b.name, 'et'));
    // Assign smallintId in place so downstream loops that iterate
    // sortedMaakonnad see the id directly.
    sortedMaakonnad.forEach((m, i) => { m.smallintId = i + 1; });
    const maakondByName = new Map(sortedMaakonnad.map(m => [m.name, m]));

    for (const parish of parishes) {
      const mainRing = parish.rings.reduce((a, b) => (b.length > a.length ? b : a));
      const [cx, cy] = ringCentroid(mainRing);
      let matched = null;
      for (const m of sortedMaakonnad) {
        if (pointInAnyRing(cx, cy, m.rings)) { matched = maakondByName.get(m.name); break; }
      }
      parish.maakondId = matched ? matched.smallintId : null;
      if (!matched) console.warn(`  ! parish "${parish.name}" (id=${parish.id}) has no maakond match — will be skipped`);
    }

    const stations = await fetchStations();
    console.log(`Loaded ${stations.length} EE stations. Running point-in-polygon…`);

    // Index parishes by maakond for a faster coarse check (optional; tiny scale here).
    const stationAssignments = []; // {stationId, parishId}
    const unmatched = [];
    for (const s of stations) {
      if (s.latitude == null || s.longitude == null) continue;
      let assigned = null;
      for (const p of parishes) {
        if (!p.maakondId) continue;
        if (pointInAnyRing(s.longitude, s.latitude, p.rings)) { assigned = p; break; }
      }
      if (assigned) stationAssignments.push({ stationId: s.id, parishId: assigned.id });
      else unmatched.push(s);
    }
    if (unmatched.length) console.warn(`  ! ${unmatched.length} stations did not match any parish (kept with parish_id NULL).`);

    // Emit SQL.
    const lines = [];
    lines.push('-- Generated by scripts/seed_parishes.js — DO NOT EDIT BY HAND.');
    lines.push('-- Apply AFTER migrations/schema_phase29_discovery_map.sql.');
    lines.push('-- Idempotent: re-running is safe. Commit alongside the migration.');
    lines.push('');
    lines.push('begin;');
    lines.push('');
    lines.push('-- 1. Maakonnad');
    for (const m of sortedMaakonnad) {
      const emoji = MAAKOND_EMOJI[m.name] || '📍';
      lines.push(`insert into maakonnad (id, name, emoji) values (${m.smallintId}, ${sqlString(m.name)}, ${sqlString(emoji)}) on conflict (id) do update set name = excluded.name, emoji = excluded.emoji;`);
    }
    lines.push('');
    lines.push('-- 2. Parishes');
    for (const p of parishes) {
      if (!p.maakondId) continue;
      lines.push(`insert into parishes (id, maakond_id, name) values (${p.id}, ${p.maakondId}, ${sqlString(p.name)}) on conflict (id) do update set maakond_id = excluded.maakond_id, name = excluded.name;`);
    }
    lines.push('');
    lines.push('-- 3. Station → parish assignments (batched via VALUES/UPDATE FROM).');
    const BATCH = 500;
    for (let i = 0; i < stationAssignments.length; i += BATCH) {
      const chunk = stationAssignments.slice(i, i + BATCH);
      const values = chunk.map(r => `(${sqlString(r.stationId)}::uuid, ${r.parishId})`).join(',\n  ');
      lines.push('update stations s set parish_id = v.parish_id from (values');
      lines.push('  ' + values);
      lines.push(') as v(station_id, parish_id) where s.id = v.station_id;');
      lines.push('');
    }

    lines.push('-- 4. Recompute denormalized counts.');
    lines.push("update parishes p set station_count = coalesce((select count(*) from stations s where s.parish_id = p.id and s.country = 'EE'), 0);");
    lines.push("update maakonnad m set station_count = coalesce((select sum(p.station_count) from parishes p where p.maakond_id = m.id), 0);");
    lines.push('');
    lines.push('-- 5. Assertions.');
    lines.push('do $$ begin');
    lines.push('  assert (select count(*) from maakonnad) = 15, \'expected 15 maakonnad\';');
    lines.push('  assert (select count(*) from parishes where station_count > 0) > 0, \'expected parishes with stations\';');
    lines.push('end $$;');
    lines.push('');
    lines.push('commit;');
    lines.push('');

    const outPath = join(dirname(fileURLToPath(import.meta.url)), 'parishes_seed.sql');
    writeFileSync(outPath, lines.join('\n'), 'utf8');
    console.log(`Wrote ${outPath} (${stationAssignments.length} stations matched, ${unmatched.length} unmatched).`);

    // Emit a thin GeoJSON with just the 15 maakond outlines + bbox for the
    // Avastuskaart client layer. Parish polygons are intentionally omitted —
    // would be ~10x the payload and we don't need parish borders rendered.
    // Coords rounded to 3 decimals (~110 m) + Douglas-Peucker-ish dedup of
    // near-collinear points to cut the payload down from ~1 MB to ~100 KB
    // without visibly degrading national-scale borders.
    const round = (n) => Math.round(n * 1000) / 1000;
    function simplifyRing(ring, tol) {
      // Drop points that are within `tol` degrees of the previous kept point.
      // Trivial but effective for 1:1M-scale rendering.
      if (ring.length < 3) return ring;
      const out = [ring[0]];
      for (let i = 1; i < ring.length - 1; i++) {
        const [lon, lat] = ring[i];
        const [plon, plat] = out[out.length - 1];
        if (Math.abs(lon - plon) > tol || Math.abs(lat - plat) > tol) out.push(ring[i]);
      }
      out.push(ring[ring.length - 1]);
      return out;
    }
    const maakondGeo = {
      type: 'FeatureCollection',
      features: sortedMaakonnad.map(m => {
        let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
        const coordinates = m.rings.map(ring => {
          const rounded = ring.map(([lon, lat]) => {
            if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
            return [round(lon), round(lat)];
          });
          return simplifyRing(rounded, 0.0015);
        });
        return {
          type: 'Feature',
          properties: {
            id: m.smallintId,
            name: m.name,
            bbox: [round(minLon), round(minLat), round(maxLon), round(maxLat)],
          },
          geometry: { type: 'MultiPolygon', coordinates: coordinates.map(r => [r]) },
        };
      }),
    };
    const geoPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maakonnad.geojson');
    writeFileSync(geoPath, JSON.stringify(maakondGeo), 'utf8');
    console.log(`Wrote ${geoPath} (${maakondGeo.features.length} maakond polygons).`);

    // Parish outlines — coarser tolerance than maakonnad (0.0025 vs 0.0015)
    // since parishes are rendered at closer zooms and there are 5× as many
    // of them. Same rounding strategy keeps the payload tight.
    const parishGeo = {
      type: 'FeatureCollection',
      features: parishes
        .filter(p => p.maakondId != null)
        .map(p => {
          let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
          const coordinates = p.rings.map(ring => {
            const rounded = ring.map(([lon, lat]) => {
              if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
              if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
              return [round(lon), round(lat)];
            });
            return simplifyRing(rounded, 0.0025);
          });
          return {
            type: 'Feature',
            properties: {
              id: p.id,
              maakond_id: p.maakondId,
              name: p.name,
              bbox: [round(minLon), round(minLat), round(maxLon), round(maxLat)],
            },
            geometry: { type: 'MultiPolygon', coordinates: coordinates.map(r => [r]) },
          };
        }),
    };
    const parishGeoPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'parishes.geojson');
    writeFileSync(parishGeoPath, JSON.stringify(parishGeo), 'utf8');
    console.log(`Wrote ${parishGeoPath} (${parishGeo.features.length} parish polygons).`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
