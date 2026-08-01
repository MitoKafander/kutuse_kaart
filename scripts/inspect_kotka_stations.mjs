// Read-only: dumps every station near the Kotka rist junction (Kuusalu vald)
// plus their price rows, to triage the 2026-07-31 duplicate/wrong-location reports.
// Run from project root: `node scripts/inspect_kotka_stations.mjs`
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Bounding box roughly covering Kotka rist + 6 km around it
const BOX = { latMin: 59.49, latMax: 59.59, lonMin: 25.65, lonMax: 25.85 };

console.log('=== Stations in the Kotka rist area (any active state) ===');
{
  const { data, error } = await sb
    .from('stations')
    .select('*')
    .gte('latitude', BOX.latMin).lte('latitude', BOX.latMax)
    .gte('longitude', BOX.lonMin).lte('longitude', BOX.lonMax);
  if (error) console.error('ERR:', error.message);
  else console.log(JSON.stringify(data, null, 2));
}

console.log('\n=== Any station named like Krooning / Kotka (nationwide) ===');
{
  const { data, error } = await sb
    .from('stations')
    .select('id, name, latitude, longitude, active, parish_id, amenities')
    .or('name.ilike.%krooning%,name.ilike.%kotka%');
  if (error) console.error('ERR:', error.message);
  else console.log(JSON.stringify(data, null, 2));
}

console.log('\n=== Price rows for the two reported stations ===');
for (const id of ['f188ce2e-9d3d-44bc-a1e6-5b2d779e802f', '307396cc-b0aa-434c-83aa-7512e8a0972f']) {
  const { data, error } = await sb
    .from('prices')
    .select('*')
    .eq('station_id', id)
    .limit(10);
  console.log(`\n-- ${id} --`);
  if (error) console.error('ERR:', error.message);
  else console.log(JSON.stringify(data, null, 2));
}
