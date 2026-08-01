// Read-only: lists every station still carrying the "Jetoil PDF 2026-04-29"
// manual-seed source tag, with its price-row count. That seed geocoded rows
// without OSM corroboration and has already produced several shadow duplicates
// at wrong coordinates (Krooning Võhma, Hepa Kehtna, Krooning Kotka-Risti).
// Run from project root: `node scripts/audit_jetoil_pdf_seeds.mjs`
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

const { data: stations, error } = await sb
  .from('stations')
  .select('id, name, latitude, longitude, active, parish_id, amenities');
if (error) { console.error('ERR:', error.message); process.exit(1); }

const seeded = stations.filter((s) =>
  JSON.stringify(s.amenities || {}).includes('Jetoil PDF 2026-04-29')
);

const { data: prices } = await sb.from('prices').select('station_id');
const priceCount = new Map();
for (const p of prices || []) priceCount.set(p.station_id, (priceCount.get(p.station_id) || 0) + 1);

console.log(`Total stations: ${stations.length}`);
console.log(`Jetoil-PDF-seeded rows: ${seeded.length} (active: ${seeded.filter((s) => s.active).length})\n`);
for (const s of seeded.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))) {
  const n = priceCount.get(s.id) || 0;
  const note = s.amenities?.kyts_note ? ` | note: ${s.amenities.kyts_note}` : '';
  console.log(
    `${s.active ? 'ACTIVE  ' : 'inactive'} ${s.name.padEnd(30)} ${s.latitude},${s.longitude}  prices=${n}${note}`
  );
}
