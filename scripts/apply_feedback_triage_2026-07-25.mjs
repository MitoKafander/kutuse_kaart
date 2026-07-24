// Feedback triage 2026-07-25 — three idempotent writes:
//   1) Rename station 8ecf1e4e "Jõelähtme tankla" -> "Olerex"
//      (operator was already Olerex in amenities; getBrand() reads only `name`,
//       so a generic name showed the station unbranded. Field report by Mikk.)
//   2) Close general feedback c175de51 (vald-boundary double line) — fix shipped
//      2026-07-21, commit 6cbf2e8, verified live.
//   3) Send an in-app thank-you reply to the reporter (Kaia), tailored to the
//      boundary feedback + her Hepa Kehtna phantom report.
// Run from project root: `node scripts/apply_feedback_triage_2026-07-25.mjs`
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });
const sb = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const STATION_ID = '8ecf1e4e-3be3-4f0b-a861-e122b7d5d4cd';
const FEEDBACK_ID = 'c175de51-063f-4534-b468-66d133bc057a';

const REPLY = `Tere, Kaia!

Suur tänu tähelepaneliku tagasiside eest — Sul oli täiesti õigus. Valdade piirid kuvati tõesti kahe eraldi joonena, mille vahele jäi kohati justkui "eikellegimaa". Põhjus oli tehniline: vallapiirid ja maakonnapiirid olid kaardil kahe eraldi kihina, mis olid teineteisest sõltumatult lihtsustatud, nii et naabervaldade ühine piir joonistati kaks korda veidi erineva joonena.

Parandasin selle ära: laadisin mõlemad piirikihid uuesti algallikast (OSM / Maa-amet), kus naabervallad jagavad ühte ja sama piirijoont — nüüd on iga vallapiir üks selge joon, ilma vahede ja topeltjoonteta. Muudatus on juba kyts.ee-s väljas.

Sinu tähelepanek oli väga väärtuslik — see polnud pelgalt kosmeetika, vaid tõi välja päris andmevea, mis puudutas kogu kaarti. Just selliste täpsete märkuste peale saabki Kyts paremaks.

Märkasin ka, et andsid teada Kehtna Hepa tanklast, mida tegelikult pole (seal on kortermajad) — seegi "tankla" on nüüd kaardilt eemaldatud. Aitäh, et võtsid aega mõlemast teada anda!

Tervitustega,
Mikk`;

// 1) Rename -> Olerex
{
  const { data, error } = await sb.from('stations')
    .update({ name: 'Olerex' })
    .eq('id', STATION_ID)
    .select('id, name, active');
  console.log('1) RENAME:', error ? 'ERR ' + error.message : JSON.stringify(data));
}

// 2) Resolve the boundary feedback
{
  const { data, error } = await sb.from('feedback')
    .update({
      resolved_at: new Date().toISOString(),
      resolution_note: 'Parandatud 2026-07-21 (commit 6cbf2e8): mõlemad piirikihid (parishes.geojson + maakonnad.geojson) uuesti OSM-ist (admin_level=7); naabervaldade jagatud teed = üks joon. Live kyts.ee-l kinnitatud. Vastatud kasutajale in-app.',
    })
    .eq('id', FEEDBACK_ID)
    .select('id, resolved_at');
  console.log('2) RESOLVE:', error ? 'ERR ' + error.message : JSON.stringify(data));
}

// 3) Insert the thank-you reply (guard against duplicates on re-run)
{
  const { data: existing } = await sb.from('feedback_replies')
    .select('id').eq('feedback_id', FEEDBACK_ID);
  if (existing && existing.length) {
    console.log('3) REPLY: skipped — a reply already exists for this feedback.');
  } else {
    const { data, error } = await sb.from('feedback_replies')
      .insert({ feedback_id: FEEDBACK_ID, message: REPLY })
      .select('id, created_at');
    console.log('3) REPLY:', error ? 'ERR ' + error.message : JSON.stringify(data));
  }
}

// verify open queue is now empty
{
  const { data } = await sb.from('v_open_feedback').select('id');
  console.log('\nOpen feedback remaining:', data?.length ?? 0);
}
