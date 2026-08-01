// Read-only: every Kyts station around Võru, to check whether the active
// "Olerex" inside Taara sõjaväelinnak (4bf1b5a7, OSM node 6291704924,
// access=no, 0 prices) is a stray military fuel point or the DB's only record
// of a real public station nearby.
// Run from project root: `node scripts/inspect_voru_stations.mjs`
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

const km = (a, b, c, d) => {
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const TARGET = [57.8222788, 27.0216309];

const { data } = await sb
  .from('stations')
  .select('id, name, latitude, longitude, active, amenities')
  .gte('latitude', 57.78).lte('latitude', 57.87)
  .gte('longitude', 26.95).lte('longitude', 27.12);

data.sort((a, b) => km(...TARGET, a.latitude, a.longitude) - km(...TARGET, b.latitude, b.longitude));
for (const s of data) {
  const { count } = await sb.from('prices').select('id', { count: 'exact', head: true }).eq('station_id', s.id);
  const d = km(...TARGET, s.latitude, s.longitude);
  console.log(`${s.active ? 'ACTIVE  ' : 'inactive'} ${d.toFixed(2)} km  ${s.name}  (${s.id})  prices=${count}`);
  console.log(`         ${s.latitude},${s.longitude}  amenities: ${JSON.stringify(s.amenities)}`);
}
