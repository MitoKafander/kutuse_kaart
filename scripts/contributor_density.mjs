// Read-only: how many DISTINCT non-admin contributors submit prices, nationwide
// and per city, over time windows. This is the number the whole data-freshness
// plan hinges on (the denominator every crowd mechanic multiplies).
//   node scripts/contributor_density.mjs
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url'; import { dirname, join } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CITIES = {
  Tallinn:[59.437,24.7536], Tartu:[58.3776,26.729], Pärnu:[58.3859,24.4971], Narva:[59.3773,28.1903],
  'Kohtla-Järve':[59.3986,27.2735], Jõhvi:[59.3592,27.4211], Sillamäe:[59.3997,27.7633], Viljandi:[58.3639,25.59],
  Rakvere:[59.3464,26.3558], Kuressaare:[58.2529,22.4857], Valga:[57.7769,26.0475], Võru:[57.8339,27.0197],
  Haapsalu:[58.9431,23.5413], Keila:[59.3036,24.4137], Paide:[58.8858,25.5571], Rapla:[59.0072,24.7928],
  Maardu:[59.4767,25.0257], Elva:[58.2226,26.4211], Põlva:[58.0606,27.0694], Jõgeva:[58.7462,26.394],
};
const hav=(a,b)=>{const R=6371,tr=d=>d*Math.PI/180;const dLat=tr(b[0]-a[0]),dLon=tr(b[1]-a[1]);const s=Math.sin(dLat/2)**2+Math.cos(tr(a[0]))*Math.cos(tr(b[0]))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(s));};
function nearestCity(lat,lon){ let best=null,bd=1e9; for(const[n,c]of Object.entries(CITIES)){const d=hav([lat,lon],c); if(d<bd){bd=d;best=n;}} return bd<=20?best:'(muu/maa)'; }
async function pa(t,c,tw){const o=[];let f=0;while(true){let q=sb.from(t).select(c).range(f,f+999);if(tw)q=tw(q);const{data,error}=await q;if(error){console.error(t,error);process.exit(1);}o.push(...data);if(data.length<1000)break;f+=1000;}return o;}

const stations=(await pa('stations','id,latitude,longitude,active,country')).filter(s=>s.active!==false);
const cityOf=new Map(stations.map(s=>[s.id, (s.latitude!=null?nearestCity(s.latitude,s.longitude):'(muu/maa)')]));
const prices=await pa('prices','id,station_id,user_id,reported_at,entry_method');

const now=Date.now(), ageD=t=>(now-new Date(t).getTime())/8.64e7;
const WINDOWS=[['7d',7],['30d',30],['90d',90],['365d',365],['all',1e9]];
// non-admin, real crowd submissions only
const crowd=prices.filter(p=>p.user_id && p.entry_method!=='admin');
console.log(`prices total=${prices.length}, admin=${prices.filter(p=>p.entry_method==='admin').length}, crowd(non-admin,user)=${crowd.length}`);

// nationwide distinct contributors per window
console.log('\n=== Nationwide DISTINCT non-admin contributors ===');
for(const[label,d]of WINDOWS){ const u=new Set(crowd.filter(p=>ageD(p.reported_at)<=d).map(p=>p.user_id)); const n=crowd.filter(p=>ageD(p.reported_at)<=d).length; console.log(`  ${label.padEnd(5)} contributors=${u.size}  submissions=${n}`); }

// per-city distinct contributors, windows 30d / 90d / 365d / all
const cities=[...new Set([...Object.keys(CITIES),'(muu/maa)'])];
const rows=[];
for(const city of cities){
  const cp=crowd.filter(p=>cityOf.get(p.station_id)===city);
  const c=win=>new Set(cp.filter(p=>ageD(p.reported_at)<=win).map(p=>p.user_id)).size;
  rows.push({city, d7:c(7), d30:c(30), d90:c(90), d365:c(365), all:c(1e9), subsAll:cp.length});
}
rows.sort((a,b)=>b.all-a.all);
console.log('\n=== DISTINCT non-admin contributors per city ===');
console.log('city'.padEnd(16),'7d'.padStart(4),'30d'.padStart(5),'90d'.padStart(5),'365d'.padStart(6),'all'.padStart(5),'subsAll'.padStart(8));
for(const r of rows) console.log(r.city.padEnd(16), String(r.d7).padStart(4), String(r.d30).padStart(5), String(r.d90).padStart(5), String(r.d365).padStart(6), String(r.all).padStart(5), String(r.subsAll).padStart(8));

// distinct contributors overall (who are these people?)
const everUsers=new Set(crowd.map(p=>p.user_id));
const active90=new Set(crowd.filter(p=>ageD(p.reported_at)<=90).map(p=>p.user_id));
console.log(`\nTotal distinct non-admin contributors ever: ${everUsers.size}; active last 90d: ${active90.size}; last 30d: ${new Set(crowd.filter(p=>ageD(p.reported_at)<=30).map(p=>p.user_id)).size}`);
// top contributors by volume (last 365d)
const vol=new Map(); for(const p of crowd.filter(p=>ageD(p.reported_at)<=365)) vol.set(p.user_id,(vol.get(p.user_id)||0)+1);
const top=[...vol.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
console.log('Top contributors (submissions, last 365d):', top.map(([u,n])=>n).join(', '), `(concentration: top user = ${top[0]?top[0][1]:0} subs)`);
