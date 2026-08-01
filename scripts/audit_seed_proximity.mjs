// Read-only: for every ACTIVE "Jetoil PDF 2026-04-29" seeded station, find the
// nearest other active station and the nearest OSM amenity=fuel node.
//
// Why: the 2026-07-16 audit caught shadow duplicates by NAME, so a shadow whose
// real counterpart carries a generic OSM name slipped through (Krooning
// Kotka-Risti vs the real "Kotka Rist" 1.6 km away). Proximity + OSM presence
// catches that class. A seed with 0 prices, no OSM fuel node at its own coords,
// and a real station within ~2 km is a shadow-duplicate candidate.
//
// Run from project root: `node scripts/audit_seed_proximity.mjs`
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });

const sb = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const km = (a, b) => {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const { data: stations } = await sb.from('stations').select('id, name, latitude, longitude, active, amenities');

// PostgREST caps a plain select at 1000 rows — page through or every count lies.
const priceCount = new Map();
{
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('prices').select('station_id').range(from, from + PAGE - 1);
    if (error) { console.error('price fetch ERR:', error.message); break; }
    for (const p of data) priceCount.set(p.station_id, (priceCount.get(p.station_id) || 0) + 1);
    if (data.length < PAGE) break;
  }
  const total = [...priceCount.values()].reduce((a, b) => a + b, 0);
  console.log(`Price rows counted: ${total} across ${priceCount.size} stations`);
}

const seeds = stations.filter(
  (s) => s.active && JSON.stringify(s.amenities || {}).includes('Jetoil PDF 2026-04-29')
);
const others = stations.filter((s) => s.active);

// Overpass in small batches with backoff across mirrors — the public instance
// rejects big multi-clause queries when busy, and a silent empty result would
// make every seed look like it has no OSM fuel node near it.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(batch) {
  const clauses = batch.map((s) => `nwr(around:2500,${s.latitude},${s.longitude})[amenity=fuel];`).join('\n  ');
  const query = `[out:json][timeout:90];\n(\n  ${clauses}\n);\nout center tags;`;
  for (let attempt = 0; attempt < 9; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      // Overpass mirrors 406/429 a request without a meaningful User-Agent.
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'kyts-station-audit/1.0 (+https://kyts.ee)',
          'Content-Type': 'text/plain',
        },
        body: query,
      });
      const text = await res.text();
      if (text.trimStart().startsWith('{')) return JSON.parse(text).elements;
    } catch { /* network hiccup — fall through to backoff */ }
    await sleep(3000 + attempt * 2000);
  }
  throw new Error('Overpass unavailable after 9 attempts across mirrors');
}

const osm = [];
for (let i = 0; i < seeds.length; i += 4) {
  const batch = seeds.slice(i, i + 4);
  osm.push(...(await overpass(batch)));
  console.error(`  overpass: ${Math.min(i + 4, seeds.length)}/${seeds.length} seeds queried`);
}
const osmPts = osm.map((e) => ({
  latitude: e.lat ?? e.center?.lat,
  longitude: e.lon ?? e.center?.lon,
  tags: e.tags || {},
}));
console.log(`OSM fuel features near seeds: ${osmPts.length}\n`);

for (const s of seeds.sort((a, b) => a.name.localeCompare(b.name))) {
  const near = others
    .filter((o) => o.id !== s.id)
    .map((o) => ({ o, d: km(s, o) }))
    .sort((a, b) => a.d - b.d)[0];
  const nearOsm = osmPts.map((p) => ({ p, d: km(s, p) })).sort((a, b) => a.d - b.d)[0];

  const n = priceCount.get(s.id) || 0;
  const osmSelf = nearOsm && nearOsm.d < 0.25;
  const flag = n === 0 && !osmSelf && near && near.d < 2.5 ? '🚩 SHADOW?' : '  ok      ';

  console.log(`${flag} ${s.name.padEnd(28)} prices=${String(n).padEnd(3)}`);
  console.log(`             nearest active station: ${near.d.toFixed(2)} km — ${near.o.name} (prices=${priceCount.get(near.o.id) || 0})`);
  console.log(
    nearOsm
      ? `             nearest OSM fuel:       ${nearOsm.d.toFixed(2)} km — ${nearOsm.p.tags.name || nearOsm.p.tags.brand || '(unnamed)'}`
      : `             nearest OSM fuel:       none within 2.5 km`
  );
}
