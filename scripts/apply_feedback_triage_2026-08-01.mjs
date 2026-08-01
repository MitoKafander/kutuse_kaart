// Triage of the two station_reports filed 2026-07-31 (both by the owner,
// on-site at the Kotka rist junction in Kuusalu vald).
//
//   report 8aa05062  wrong_info     on "Kotka Rist"           — "Se on krooning tankla"
//   report 705dd095  wrong_location on "Krooning Kotka-Risti" — "Tundub nagu oleks keset metsa"
//
// Both describe ONE station recorded twice:
//   * 307396cc "Kotka Rist"          59.540088/25.7340125 — OSM node 579788463
//     (amenity=fuel, shop=kiosk, 24/7), 7 price rows including the owner's own
//     camera scan on 2026-07-31 08:03 and a manual entry 2026-08-01. REAL, but
//     carries the junction name, so getBrand() (which reads only `name`)
//     rendered it unbranded.
//   * f188ce2e "Krooning Kotka-Risti" 59.54056/25.76277 — "Jetoil PDF
//     2026-04-29" manual seed whose own source note says "OSM has no
//     amenity=fuel here"; 0 price rows; 1.62 km east of the real one, in
//     forest. Same shadow-duplicate class as Krooning Võhma / the four Hepa
//     rows deactivated in the 2026-07-16 audit.
//
// Overpass confirms exactly ONE amenity=fuel feature within 3 km of either
// point: node 579788463 at the "Kotka Rist" coordinates.
//
// Writes (idempotent):
//   1. rename 307396cc -> "Krooning"  (getBrand matches 'krooning'; amenities
//      .name "Kotka Rist" != brand, so getStationDisplayName renders
//      "Krooning (Kotka Rist)")
//   2. deactivate f188ce2e + kyts_note, matching the 2026-07-16 audit wording.
//      The phase-64 trigger auto-decrements Kuusalu vald's station_count.
//
// Run from project root: `node scripts/apply_feedback_triage_2026-08-01.mjs`
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

const REAL = '307396cc-b0aa-434c-83aa-7512e8a0972f'; // "Kotka Rist"
const SHADOW = 'f188ce2e-9d3d-44bc-a1e6-5b2d779e802f'; // "Krooning Kotka-Risti"

// --- 1. brand the real station -------------------------------------------
{
  const { data: before } = await sb.from('stations').select('id, name, amenities').eq('id', REAL).single();
  if (before.name === 'Krooning') {
    console.log('1. rename: already applied (name = "Krooning") — skipping');
  } else {
    const { error } = await sb.from('stations').update({ name: 'Krooning' }).eq('id', REAL);
    if (error) throw new Error(`rename failed: ${error.message}`);
    console.log(`1. rename: "${before.name}" -> "Krooning" (amenities.name "${before.amenities?.name}" preserved)`);
  }
}

// --- 2. deactivate the Jetoil-PDF shadow ---------------------------------
{
  const { data: before } = await sb.from('stations').select('id, name, active, amenities').eq('id', SHADOW).single();
  if (before.active === false) {
    console.log('2. deactivate: already applied (active = false) — skipping');
  } else {
    const amenities = {
      ...(before.amenities || {}),
      kyts_note:
        'Duplicate of "Kotka Rist"/Krooning (307396cc, correctly placed on OSM node 579788463, has prices). ' +
        'Jetoil-PDF shadow at wrong coords, 1.62 km east in forest, 0 prices. ' +
        'Deactivated 2026-08-01 after owner wrong_location report 705dd095.',
    };
    const { error } = await sb.from('stations').update({ active: false, amenities }).eq('id', SHADOW);
    if (error) throw new Error(`deactivate failed: ${error.message}`);
    console.log(`2. deactivate: "${before.name}" active -> false, kyts_note set`);
  }
}

// --- verify ---------------------------------------------------------------
const { data: after } = await sb
  .from('stations')
  .select('id, name, active, latitude, longitude, parish_id')
  .in('id', [REAL, SHADOW]);
console.log('\nAfter:');
console.log(JSON.stringify(after, null, 2));

const { data: parish } = await sb
  .from('parishes')
  .select('id, name, station_count')
  .eq('id', 350346)
  .single();
console.log(`\nKuusalu vald (350346) station_count = ${parish.station_count}`);
