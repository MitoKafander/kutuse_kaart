// Second Jetoil-PDF shadow duplicate, found by the cohort audit rather than by
// a user report. Verified before acting, because the naive read ("a Krooning
// sits 2.16 km away, so this is a dup") would have been wrong if Krooning
// really did run a separate station in Padise village.
//
// What the sources actually say:
//   * Krooning's own Põhja-Eesti list DOES have a "Padise tankla" (named
//     attendant + phone), so the row is not fiction.
//   * BUT the Eesti Varude Keskus emergency-filling-station register lists
//     AS Krooning at "Harju maakond, Lääne-Harju vald, Rummu alevik,
//     Haapsalu mnt 40" and has NO Padise entry. The chain names the station
//     "Padise" (historic Padise vald / the Padise direction); it stands in
//     Rummu.
//   * OSM way 265261526 (amenity=fuel, building=roof) is on Haapsalu mnt in
//     Rummu alevik, immediately beside "Tammetare bistroo", Haapsalu mnt 38.
//     That is the same station, and it is already in the DB as b505139b
//     "Krooning" with 2 price rows.
//   * OSM has NO amenity=fuel within 2.4 km of Padise küla. The 16366.ee
//     directory coords for "Padise tankla" (59.21808/24.13497) land on open
//     ground by the Kloostri river — a village-centroid geocode of the postal
//     address, not a station position.
//   * The seed a21fe648 sits at 59.22775/24.20565, which reverse-geocodes to
//     the former Murru prison — 2.1 km east of the real station, 0 prices,
//     no amenity=fuel within 600 m.
//
// => One station, recorded twice. Deactivate the seed; enrich the survivor
//    with its verified address so it stops rendering as a bare "Krooning".
//
// Run from project root: `node scripts/apply_padise_triage_2026-08-01.mjs`
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

const SHADOW = 'a21fe648-39b9-483e-ab40-61c5af84ab6f'; // "Krooning Padise tankla"
const REAL = 'b505139b-5cdc-4c54-af4e-b79a88975664'; // "Krooning" @ OSM way 265261526

// --- 1. deactivate the mis-geocoded seed ---------------------------------
{
  const { data: before } = await sb.from('stations').select('name, active, amenities').eq('id', SHADOW).single();
  if (before.active === false) {
    console.log('1. deactivate: already applied — skipping');
  } else {
    const amenities = {
      ...(before.amenities || {}),
      kyts_note:
        'Duplicate of "Krooning" (b505139b, OSM way 265261526, Haapsalu mnt 40 Rummu alevik, has prices). ' +
        'Krooning calls that station "Padise tankla" but it stands in Rummu — Eesti Varude Keskus ' +
        'emergency-station register lists AS Krooning at Rummu alevik Haapsalu mnt 40 and no Padise address; ' +
        'OSM has no amenity=fuel within 2.4 km of Padise küla. This Jetoil-PDF row geocoded onto the former ' +
        'Murru prison, 2.1 km east, 0 prices. Deactivated 2026-08-01 (cohort audit, not user-reported).',
    };
    const { error } = await sb.from('stations').update({ active: false, amenities }).eq('id', SHADOW);
    if (error) throw new Error(`deactivate failed: ${error.message}`);
    console.log(`1. deactivate: "${before.name}" active -> false, kyts_note set`);
  }
}

// --- 2. give the survivor its verified address ---------------------------
// It currently renders as a bare "Krooning" (amenities hold only
// amenity/building, so getStationDisplayName has no city/street to append).
{
  const { data: before } = await sb.from('stations').select('name, amenities').eq('id', REAL).single();
  if (before.amenities?.['addr:street']) {
    console.log('2. enrich: already applied — skipping');
  } else {
    const amenities = {
      ...(before.amenities || {}),
      'addr:city': 'Rummu alevik',
      'addr:street': 'Haapsalu mnt',
      'addr:housenumber': '40',
      operator: 'AS Krooning',
      kyts_note:
        'Address from Eesti Varude Keskus emergency-filling-station register ' +
        '("Lääne-Harju vald, Rummu alevik, Haapsalu mnt 40"); OSM way 265261526 is unnamed. ' +
        'Krooning markets this as "Padise tankla". Set 2026-08-01.',
    };
    const { error } = await sb.from('stations').update({ amenities }).eq('id', REAL);
    if (error) throw new Error(`enrich failed: ${error.message}`);
    console.log('2. enrich: addr:city/street/housenumber + operator set on the surviving Krooning');
  }
}

// --- verify ---------------------------------------------------------------
const { data: after } = await sb
  .from('stations')
  .select('id, name, active, latitude, longitude, parish_id, amenities')
  .in('id', [SHADOW, REAL]);
console.log('\nAfter:');
for (const s of after) {
  console.log(`  ${s.active ? 'ACTIVE  ' : 'inactive'} ${s.name}  ${s.latitude},${s.longitude}`);
  console.log(`     ${JSON.stringify(s.amenities)}`);
}

const { count } = await sb
  .from('stations')
  .select('id', { count: 'exact', head: true })
  .eq('parish_id', 7692055)
  .eq('active', true);
const { data: parish } = await sb.from('parishes').select('name, station_count').eq('id', 7692055).single();
console.log(`\n${parish.name}: active rows = ${count}, parishes.station_count = ${parish.station_count}`);
