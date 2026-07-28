// Read-only: how fresh is the crowd price data overall and in the top cities?
// Decides whether SEO landing pages have compelling fresh content. Run:
//   node scripts/freshness_audit.mjs
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function pageAll(table, cols, tweak) {
  const out = []; const step = 1000; let from = 0;
  while (true) {
    let q = sb.from(table).select(cols).range(from, from + step - 1);
    if (tweak) q = tweak(q);
    const { data, error } = await q;
    if (error) { console.error(table, error); process.exit(1); }
    out.push(...data); if (data.length < step) break; from += step;
  }
  return out;
}
const CITIES = {
  Tallinn: { lat: 59.437, lon: 24.7536 }, Tartu: { lat: 58.3776, lon: 26.729 },
  Pärnu: { lat: 58.3859, lon: 24.4971 }, Narva: { lat: 59.3773, lon: 28.1903 },
};
const haversine = (a, b) => { const R=6371,tr=d=>d*Math.PI/180; const dLat=tr(b.lat-a.lat),dLon=tr(b.lon-a.lon);
  const s=Math.sin(dLat/2)**2+Math.cos(tr(a.lat))*Math.cos(tr(b.lat))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(s)); };

const stations = (await pageAll('stations','id, latitude, longitude, active, country'))
  .filter(s => s.active !== false && (!s.country || s.country==='EE' || s.country==='Estonia'));
const prices = await pageAll('prices','station_id, fuel_type, price, reported_at', q=>q.order('reported_at',{ascending:false}));
const now = Date.now(); const ageD = t => (now-new Date(t).getTime())/8.64e7;

// latest price per station (any fuel) — how recently was this station updated at all
const latestByStation = new Map();
for (const p of prices) if (!latestByStation.has(p.station_id)) latestByStation.set(p.station_id, p.reported_at);

const withPrice = stations.filter(s => latestByStation.has(s.id));
const buckets = { '≤24h':0, '≤7d':0, '≤14d':0, '≤30d':0, '≤45d':0, '>45d':0, 'never':0 };
for (const s of stations) {
  const t = latestByStation.get(s.id);
  if (!t) { buckets.never++; continue; }
  const d = ageD(t);
  if (d<=1) buckets['≤24h']++; else if (d<=7) buckets['≤7d']++; else if (d<=14) buckets['≤14d']++;
  else if (d<=30) buckets['≤30d']++; else if (d<=45) buckets['≤45d']++; else buckets['>45d']++;
}
console.log(`Active EE stations: ${stations.length}; with any price: ${withPrice.length}`);
console.log('Freshness of each station\'s MOST RECENT price (any fuel):');
for (const [k,v] of Object.entries(buckets)) console.log(`  ${k.padEnd(6)} ${v}`);
const freshestOverall = Math.min(...[...latestByStation.values()].map(ageD));
console.log(`Freshest single price anywhere in EE: ${freshestOverall.toFixed(1)} days old`);

console.log('\nPer top city (stations within 7km):');
for (const [name, c] of Object.entries(CITIES)) {
  const local = stations.filter(s => s.latitude!=null && haversine(c,{lat:s.latitude,lon:s.longitude})<=7);
  const ages = local.map(s=>latestByStation.get(s.id)).filter(Boolean).map(ageD).sort((a,b)=>a-b);
  const fresh7 = ages.filter(a=>a<=7).length, fresh14 = ages.filter(a=>a<=14).length, fresh45 = ages.filter(a=>a<=45).length;
  console.log(`  ${name.padEnd(8)} stations=${local.length} priced=${ages.length} freshest=${ages.length?ages[0].toFixed(1):'—'}d  ≤7d=${fresh7} ≤14d=${fresh14} ≤45d=${fresh45}`);
}
