// One-shot: apply the 2026-07-16 station audit fix.
//   - deactivates 11 verified duplicate / out-of-scope stations (evidence note on each)
//   - merges the Circle K Pärnu mnt 236 pair (keeps the fresh-priced "Järve automaat")
//   - leaves the 2 ambiguous Jetoil DPs (Betooni, Laekvere) untouched, on purpose
// Vald counts self-correct via the phase-64 active-aware trigger.
// Run from project root:  node scripts/apply_station_audit_fix.mjs
// Read-only re-runnable: deactivating an already-off row is a no-op.
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NOTE = '2026-07-16 station audit';

const deact = {
  '8722c089-331c-413b-a8f3-4976afd7ede8': 'Duplicate of existing HEPA (27214b68, correctly placed, has prices). Jetoil-PDF shadow at wrong coords.',
  '4b56a2d1-93bc-4c16-81e8-794a479441f9': 'Duplicate of existing HEPA (365b5caa, correctly placed). Jetoil-PDF shadow at wrong coords.',
  '88f59b32-dfb5-4566-922b-5c9de1be1801': 'Duplicate of existing HEPA (1a7362f3, correctly placed, has prices). Jetoil-PDF shadow at wrong coords.',
  '74d47782-ac98-471b-8556-b1c4399bfa08': 'Duplicate of existing Krooning (28620753, correctly placed, has prices). Jetoil-PDF shadow at wrong coords.',
  'a60de228-bddd-4cba-abee-e71765f6e92c': 'OSM LPG sub-node of Alexela Juri (9ef6dad6, kept) — not a separate station.',
  'd003910a-5fdc-4cb6-951a-72dcca787f32': 'Duplicate of Propaan Johvi (a816dcbc, kept) — one physical LPG station mapped twice ~21m.',
  'f8ca753c-d817-481c-bc33-64a9e9e14c5f': 'AdBlue-only pump (not a Kyts fuel), Kunda industrial depot.',
  'aea49664-a443-483b-8b98-7395eddda079': 'access=private LPG — not open to the public.',
  '4cf60df4-35e7-49d7-a278-8286779361a7': 'Fleet/industrial diislipunkt (Terminal brand, card-only like Terminal Maardu); Kunda depot, 0 public prices.',
  'd77d9537-7089-4558-bc1d-f44e1134e6f8': 'Fleet/industrial diislipunkt in Kunda depot (co-located w/ Terminal+Eler); not consumer retail, 0 prices.',
  '31d9cb27-3210-4c63-bf2e-b752ad426c4e': 'Duplicate of Circle K Jarve automaat (91c6ac16, kept survivor); same forecourt Parnu mnt 236 per circlek.ee. Merged.',
};
const CKS = '91c6ac16-c1dd-4086-bcdb-bbcb4fb11ef0'; // Circle K survivor

const affectedIds = [...Object.keys(deact)];
const { data: before } = await sb.from('stations').select('id, name, active, parish_id, amenities').in('id', [...affectedIds, CKS]);
const parishIds = [...new Set(before.map(s => s.parish_id))];
const pc0 = Object.fromEntries((await sb.from('parishes').select('id,name,station_count').in('id', parishIds)).data.map(p => [p.id, p]));

for (const s of before) {
  if (!(s.id in deact)) continue;
  const amen = { ...(s.amenities || {}), kyts_note: `${deact[s.id]} Deactivated ${NOTE}.` };
  const { error } = await sb.from('stations').update({ active: false, amenities: amen }).eq('id', s.id);
  if (error) { console.log('ERR deact', s.name, error.message); process.exit(1); }
  console.log(`OFF  "${s.name}"  ${s.id.slice(0, 8)}`);
}
{
  const surv = before.find(s => s.id === CKS);
  const amen = { ...(surv.amenities || {}), 'fuel:diesel': 'yes', 'fuel:octane_95': 'yes',
    kyts_note: `Canonical Circle K Jarve automaat (Parnu mnt 236); merged duplicate 31d9cb27 (deactivated). Fuel tags carried over. ${NOTE}.` };
  const { error } = await sb.from('stations').update({ name: 'Circle K Järve automaat', amenities: amen }).eq('id', CKS);
  if (error) { console.log('ERR survivor', error.message); process.exit(1); }
  console.log(`KEEP "Circle K Järve automaat" (survivor) ${CKS.slice(0, 8)}`);
}

const pc1 = Object.fromEntries((await sb.from('parishes').select('id,name,station_count').in('id', parishIds)).data.map(p => [p.id, p]));
console.log('\nParish station_count (auto-updated by phase64 trigger):');
for (const pid of parishIds) console.log(`  ${pc0[pid].name}: ${pc0[pid].station_count} -> ${pc1[pid].station_count}`);

const parishesAll = (await sb.from('parishes').select('id,station_count')).data;
const act = []; { let x = 0; while (true) { const { data } = await sb.from('stations').select('parish_id').eq('active', true).eq('country', 'EE').not('parish_id', 'is', null).range(x, x + 999); act.push(...data); if (data.length < 1000) break; x += 1000; } }
const live = new Map(); for (const s of act) live.set(s.parish_id, (live.get(s.parish_id) || 0) + 1);
const drift = parishesAll.filter(p => (live.get(p.id) || 0) !== p.station_count);
console.log(`\nGLOBAL DRIFT after fix: ${drift.length} parishes out of sync (expect 0)`);
