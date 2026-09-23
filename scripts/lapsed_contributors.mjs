// Read-only: the win-back segment — real (non-admin) contributors who've gone
// quiet, with the data needed to personalize a message (name, language, what
// they contributed, where, how long ago).
//   node scripts/lapsed_contributors.mjs
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv'; import { fileURLToPath } from 'url'; import { dirname, join } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function pa(t, c, tw) { const o = []; let f = 0; while (true) { let q = sb.from(t).select(c).range(f, f + 999); if (tw) q = tw(q); const { data, error } = await q; if (error) { console.error(t, error.message); process.exit(1); } o.push(...data); if (data.length < 1000) break; f += 1000; } return o; }
const CITIES = { Tallinn:[59.437,24.7536], Tartu:[58.3776,26.729], Pärnu:[58.3859,24.4971], Narva:[59.3773,28.1903], Rapla:[59.0072,24.7928], Keila:[59.3036,24.4137], Maardu:[59.4767,25.0257], Paide:[58.8858,25.5571], Viljandi:[58.3639,25.59] };
const hav=(a,b)=>{const R=6371,tr=d=>d*Math.PI/180;const dLat=tr(b[0]-a[0]),dLon=tr(b[1]-a[1]);const s=Math.sin(dLat/2)**2+Math.cos(tr(a[0]))*Math.cos(tr(b[0]))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(s));};
const nearCity=(lat,lon)=>{let b=null,bd=25;for(const[n,c]of Object.entries(CITIES)){const d=hav([lat,lon],c);if(d<bd){bd=d;b=n;}}return b;};

const stations = new Map((await pa('stations','id,name,latitude,longitude')).map(s=>[s.id,s]));
const prices = (await pa('prices','user_id,station_id,reported_at,entry_method')).filter(p=>p.user_id && p.entry_method!=='admin');
let profiles = [];
try { profiles = await pa('user_profiles','id,display_name,language'); } catch(e){ console.log('user_profiles read failed:', e.message); }
const prof = new Map(profiles.map(p=>[p.id,p]));

const now = Date.now(), ageD = t => (now-new Date(t).getTime())/8.64e7;
const byUser = new Map();
for (const p of prices) { if(!byUser.has(p.user_id)) byUser.set(p.user_id,[]); byUser.get(p.user_id).push(p); }

const rows = [];
for (const [uid, ps] of byUser) {
  ps.sort((a,b)=>new Date(b.reported_at)-new Date(a.reported_at));
  const lastD = ageD(ps[0].reported_at), firstD = ageD(ps[ps.length-1].reported_at);
  // city histogram
  const cityCount = {};
  for (const p of ps) { const s=stations.get(p.station_id); if(s&&s.latitude!=null){const c=nearCity(s.latitude,s.longitude); if(c) cityCount[c]=(cityCount[c]||0)+1;} }
  const topCity = Object.entries(cityCount).sort((a,b)=>b[1]-a[1])[0];
  const topStation = (()=>{const sc={};for(const p of ps){const s=stations.get(p.station_id);if(s)sc[s.name||p.station_id]=(sc[s.name||p.station_id]||0)+1;}return Object.entries(sc).sort((a,b)=>b[1]-a[1])[0];})();
  const pr = prof.get(uid);
  rows.push({ uid, name: pr?.display_name||null, lang: pr?.language||null, n: ps.length, lastD, firstD, topCity: topCity?topCity[0]:'?', topStation: topStation?topStation[0]:'?' });
}
rows.sort((a,b)=>b.n-a.n);
const founder = rows[0]; // top volume = confirmed founder
const lapsed = rows.filter(r=>r.uid!==founder.uid && r.lastD>30);
const warm = lapsed.filter(r=>r.lastD<=365);

console.log(`Total real contributors: ${rows.length}. Founder(excluded): ${founder.n} subs, ${founder.lastD.toFixed(0)}d since last.`);
console.log(`LAPSED (>30d inactive, non-founder): ${lapsed.length}  | of which WARM (30-365d): ${warm.length}, cold(>365d): ${lapsed.length-warm.length}`);
console.log(`With a display_name: ${lapsed.filter(r=>r.name).length}/${lapsed.length}. With language set: ${lapsed.filter(r=>r.lang).length}/${lapsed.length}`);
const langDist={}; for(const r of lapsed){const l=r.lang||'(unset)';langDist[l]=(langDist[l]||0)+1;} console.log('Language dist:', JSON.stringify(langDist));
console.log('\n=== WARM lapsed segment (name | lang | #subs | days_inactive | topCity | topStation) ===');
for (const r of warm.sort((a,b)=>a.lastD-b.lastD)) console.log(`${(r.name||'(no name)').padEnd(18)} ${(r.lang||'?').padEnd(4)} n=${String(r.n).padStart(4)} ${r.lastD.toFixed(0).padStart(4)}d  ${r.topCity.padEnd(9)} ${r.topStation}`);
console.log(`\nColds (>365d): ${lapsed.length-warm.length} users (n from ${Math.min(...lapsed.filter(r=>r.lastD>365).map(r=>r.n))} to ${Math.max(...lapsed.filter(r=>r.lastD>365).map(r=>r.n),0)} subs)`);
