// Read-only: flags active Kyts stations that sit inside an OSM military area,
// or whose only road access is tagged access=no/private.
//
// Motivated by OSM way 286963108 (amenity=fuel inside "Ämari lennubaas") — a
// military refuelling point that is correctly NOT in the DB. Kyts is a public
// retail fuel-price app, so a station the public cannot drive into is a data
// bug of the same family as the Alexela-at-Coop gas cabinets, the Elenger CNG
// point and the Terminal Oil depot.
//
// Run from project root: `node scripts/audit_military_and_private.mjs`
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

const UA = 'kyts-station-audit/1.0 (+https://kyts.ee)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function overpass(query) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(MIRRORS[attempt % MIRRORS.length], {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'text/plain' },
        body: query,
      });
      const text = await res.text();
      if (text.trimStart().startsWith('{')) return JSON.parse(text).elements;
    } catch { /* retry */ }
    await sleep(3000 + attempt * 2000);
  }
  throw new Error('Overpass unavailable');
}

// Ray casting; rings come back from Overpass `out geom` in order.
function inside(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const { data: stations } = await sb
  .from('stations')
  .select('id, name, latitude, longitude, country, amenities')
  .eq('active', true);
console.log(`Active stations: ${stations.length}`);

console.log('Fetching Estonian military areas from OSM...');
const mil = await overpass(`[out:json][timeout:180];
area["ISO3166-1"="EE"][admin_level=2]->.ee;
(
  way(area.ee)["landuse"="military"];
  way(area.ee)["military"];
  relation(area.ee)["landuse"="military"];
  relation(area.ee)["military"];
);
out geom tags;`);

const polys = [];
for (const e of mil) {
  const name = e.tags?.name || e.tags?.military || 'military area';
  if (e.type === 'way' && e.geometry) {
    polys.push({ name, ring: e.geometry.map((p) => [p.lon, p.lat]) });
  } else if (e.type === 'relation' && e.members) {
    for (const m of e.members) {
      if (m.geometry && m.role !== 'inner') polys.push({ name, ring: m.geometry.map((p) => [p.lon, p.lat]) });
    }
  }
}
console.log(`Military rings: ${polys.length}\n`);

const hits = [];
for (const s of stations) {
  const hit = polys.find((p) => p.ring.length > 2 && inside(s.longitude, s.latitude, p.ring));
  if (hit) hits.push({ s, area: hit.name });
}

if (!hits.length) {
  console.log('✅ No active station falls inside an OSM military area.');
} else {
  console.log(`🚩 ${hits.length} active station(s) inside a military area:\n`);
  for (const { s, area } of hits) {
    const { count } = await sb.from('prices').select('id', { count: 'exact', head: true }).eq('station_id', s.id);
    console.log(`  ${s.name}  (${s.id})`);
    console.log(`     ${s.latitude},${s.longitude}  prices=${count}  area="${area}"`);
    console.log(`     amenities: ${JSON.stringify(s.amenities)}`);
  }
}
