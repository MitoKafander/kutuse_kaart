// Read-only: dumps the Padise-area stations behind the suspected second
// Jetoil-PDF shadow duplicate ("Krooning Padise tankla" vs the OSM-sourced
// "Krooning" 2.16 km west). Run: `node scripts/inspect_padise_stations.mjs`
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

const { data } = await sb
  .from('stations')
  .select('id, name, latitude, longitude, active, parish_id, amenities')
  // Widened north to 59.28 so it also covers the Ämari fuel way (59.2507/24.2059)
  // that the OSM sweep turned up near Padise.
  .gte('latitude', 59.2).lte('latitude', 59.28)
  .gte('longitude', 24.1).lte('longitude', 24.32);

for (const s of data) {
  const { count } = await sb.from('prices').select('id', { count: 'exact', head: true }).eq('station_id', s.id);
  console.log(`${s.active ? 'ACTIVE  ' : 'inactive'} ${s.id}  ${s.name}`);
  console.log(`         ${s.latitude},${s.longitude}  parish=${s.parish_id}  prices=${count}`);
  console.log(`         amenities: ${JSON.stringify(s.amenities)}`);
}
