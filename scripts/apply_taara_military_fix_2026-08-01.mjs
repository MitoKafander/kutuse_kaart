// Deactivates the active "Olerex" (4bf1b5a7) that sits inside Taara
// sõjaväelinnak in Võru. Found by scripts/audit_military_and_private.mjs, not
// by a user report, and verified before acting:
//
//   * The row's amenities are {"access":"no","amenity":"fuel"} — it is OSM
//     node 6291704924, which is UNNAMED and UNBRANDED. The "Olerex" name did
//     not come from OSM.
//   * The node lies inside OSM way 276559309 "Taara sõjaväelinnak"
//     (landuse=military, military=base, barrier=fence, wikipedia
//     et:Taara sõjaväelinnak). Point-in-polygon confirmed. Every access road
//     around it is access=no, through a military=checkpoint gate ("Pääsla").
//   * Olerex's own station list (olerex.ee/sites/default/files/
//     olerex_est_tanklad.pdf, VÕRUMAA section) has exactly TWO Võru stations:
//     "Võru Räpina mnt tankla, Räpina mnt 18" and "Võru Tallinna mnt tankla,
//     Tallinna mnt 38". There is no Kose tee / Taara station.
//   * Both of those are already in the DB and active: 97963d0f (Räpina mnt,
//     3 prices) and e1018c76 (addr:street "Tallinna mnt" 38). The public
//     station next to the base at Kose tee 6 is an ALEXELA (4e195e61,
//     17 prices), also already present.
//   * The row has 0 prices, so no user contribution is lost.
//
// => Military refuelling point, not retail. Same exclusion class as the
//    Ämari air base fuel way (OSM 286963108, never imported), the Elenger
//    CNG point and the Terminal Oil / Jetoil Kunda depots.
//
// Run from project root: `node scripts/apply_taara_military_fix_2026-08-01.mjs`
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

const ID = '4bf1b5a7-3fc3-4703-8562-bfcb630da842';

const { data: before } = await sb
  .from('stations')
  .select('name, active, parish_id, amenities')
  .eq('id', ID)
  .single();

const { count: priceRows } = await sb.from('prices').select('id', { count: 'exact', head: true }).eq('station_id', ID);
if (priceRows > 0) {
  throw new Error(`Refusing to deactivate: station now has ${priceRows} price rows (expected 0) — re-verify first`);
}

if (before.active === false) {
  console.log('already applied (active = false) — skipping');
} else {
  const amenities = {
    ...(before.amenities || {}),
    kyts_out_of_scope: true,
    kyts_note:
      'NOT an Olerex and not retail. OSM node 6291704924 is unnamed/unbranded with access=no, and lies inside ' +
      'OSM way 276559309 "Taara sõjaväelinnak" (landuse=military, military=base, fenced, checkpoint gate) — ' +
      'point-in-polygon confirmed. Olerex\'s own station list has only two Võru stations, Räpina mnt 18 ' +
      '(DB 97963d0f) and Tallinna mnt 38 (DB e1018c76), both already active; the public station beside the ' +
      'base at Kose tee 6 is an Alexela (DB 4e195e61). 0 prices. Military refuelling point — same exclusion ' +
      'class as the Ämari air base fuel way (OSM 286963108, never imported). Deactivated 2026-08-01 by ' +
      'military-area audit, not user-reported.',
  };
  const { error } = await sb.from('stations').update({ active: false, amenities }).eq('id', ID);
  if (error) throw new Error(`deactivate failed: ${error.message}`);
  console.log(`deactivated "${before.name}" (${ID})`);
}

// --- verify ---------------------------------------------------------------
const { data: after } = await sb
  .from('stations')
  .select('id, name, active, latitude, longitude, parish_id')
  .eq('id', ID)
  .single();
console.log('\nAfter:', JSON.stringify(after));

const { count: activeRows } = await sb
  .from('stations')
  .select('id', { count: 'exact', head: true })
  .eq('parish_id', after.parish_id)
  .eq('active', true);
const { data: parish } = await sb
  .from('parishes')
  .select('name, station_count')
  .eq('id', after.parish_id)
  .single();
console.log(`${parish.name}: active rows = ${activeRows}, parishes.station_count = ${parish.station_count}`);
