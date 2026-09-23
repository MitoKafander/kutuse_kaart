// STEP S — the content engine (marketing strategy Phase B, right-sized).
// Computes this week's Tallinn facts DETERMINISTICALLY (LLM never touches a
// number), then uses Gemini ONLY as a rewriter against a gold-exemplar voice
// bank to draft FB / Reddit / IG posts in the proven pain-hook voice. If Gemini
// is unavailable or misbehaves, deterministic templates still ship. Output = a
// dated Markdown content pack you read, tweak, copy and post. It does NOT post.
//   node scripts/gen_content_pack.mjs
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ---------- config ----------
const CITY = { name: 'Tallinn', display: 'Tallinna', center: [59.437, 24.7536], radiusKm: 12,
  tags: /tallinn|peetri|rae|lasnam|mustam|õismäe|haabersti|kristiine|nõmme|kadaka|ülemiste/i };
const FRESH_D = 7;
const FUELS = [['Bensiin 95', '95'], ['Bensiin 98', '98'], ['Diisel', 'diisel'], ['LPG', 'LPG']];

// ---------- VOICE BANK (edit this to tune tone; gold exemplars, not the single line) ----------
const VOICE = {
  rules: [
    'Vale enne toodet: alusta tunnetatud olukorrast, mitte väitest.',
    'Päris number seotud tundega: sendid → eurod → tuju ("koos hea tujuga").',
    'Kaaslase hääl: "meie/sina", tunnista et oleme kaks tüüpi, kes ehitasid asja.',
    'Aus piiride suhtes: "Tallinnas juba päris hea kate, mujal veel õhuke."',
    'Pehme, valikuline üleskutse: "proovi, äkki aitab", mitte "Lae kohe alla!".',
  ],
  banned: ['platvorm', 'lahendus', 'innovaatiline', 'parim', 'ainus', 'revolutsioon', 'game-changer', 'disruptiivne'],
  exemplars: [
    'Väga häirib, kui tangid paagi kütust täis ja sõidad paar km edasi ning hind on 20s odavam. 15 euri läinud koos hea tujuga.',
    'Et see jama ära lõpetada ja hinnad avalikuks tuua, lõime sõbraga kütusehindade kaardi. Seal saad näha, kus on kõige odavam, ja ise märku anda.',
    'Igav lugu: tangid paagi täis, sõidad 2 km edasi — hind 20 senti odavam. 15 eurot ja hea tuju korraga läinud.',
    'Kui keegi teab täna mõnda veel soodsamat kohta, pange kommentaaridesse — täiendan hea meelega.',
    'Andmed tulevad päris inimestelt: igaüks lisab hinna, mille tanklas nägi, ja nii püsib pilt värske. Mida rohkem inimesi kaasa lööb, seda täpsem see kõigi jaoks on.',
  ],
};

// ---------- helpers ----------
const hav = (a, b) => { const R = 6371, tr = d => d * Math.PI / 180; const dLat = tr(b[0] - a[0]), dLon = tr(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(tr(a[0])) * Math.cos(tr(b[0])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
async function pageAll(t, c, tw) { const o = []; let f = 0; while (true) { let q = sb.from(t).select(c).range(f, f + 999); if (tw) q = tw(q);
  const { data, error } = await q; if (error) { console.error(t, error); process.exit(1); } o.push(...data); if (data.length < 1000) break; f += 1000; } return o; }
const now = Date.now(), ageD = t => (now - new Date(t).getTime()) / 8.64e7;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const eur = n => n.toFixed(3).replace('.', ',');
const stLabel = s => { const st = s.amenities && (s.amenities['addr:street'] || s.amenities['addr:place']); return st ? `${s.name} (${st})` : (s.name || 'tankla'); };
const MONTHS = ['jaan', 'veebr', 'märts', 'apr', 'mai', 'juuni', 'juuli', 'aug', 'sept', 'okt', 'nov', 'dets'];
const fmtDate = d => `${d.getDate()}. ${MONTHS[d.getMonth()]}`;

// ---------- compute facts (deterministic) ----------
const stations = (await pageAll('stations', 'id,name,latitude,longitude,active,country,amenities'))
  .filter(s => s.active !== false && s.latitude != null && (CITY.tags.test((s.amenities && s.amenities['addr:city']) || '') || hav(CITY.center, [s.latitude, s.longitude]) <= CITY.radiusKm));
const byId = new Map(stations.map(s => [s.id, s]));
const prices = (await pageAll('prices', 'station_id,fuel_type,price,reported_at', q => q.order('reported_at', { ascending: false })))
  .filter(p => byId.has(p.station_id));

const facts = { city: CITY.display, generatedAt: new Date(), perFuel: {}, biggestDrop: null };
for (const [ft, short] of FUELS) {
  const fp = prices.filter(p => p.fuel_type === ft);
  const latestByStation = new Map();
  for (const p of fp) if (!latestByStation.has(p.station_id)) latestByStation.set(p.station_id, p); // newest first
  const fresh = [...latestByStation.values()].filter(p => ageD(p.reported_at) <= FRESH_D).sort((a, b) => a.price - b.price);
  const lastWeek = [...latestByStation.values()].filter(p => ageD(p.reported_at) > FRESH_D && ageD(p.reported_at) <= 14);
  const thisMed = median(fresh.map(p => p.price)), lastMed = median(lastWeek.map(p => p.price));
  facts.perFuel[ft] = {
    short,
    cheapest: fresh[0] ? { label: stLabel(byId.get(fresh[0].station_id)), price: fresh[0].price, ageD: ageD(fresh[0].reported_at) } : null,
    n: fresh.length,
    wowDeltaCents: (thisMed != null && lastMed != null) ? Math.round((thisMed - lastMed) * 100) : null,
  };
}
// biggest single 7d drop across stations/fuels
for (const [ft] of FUELS) {
  const perStation = new Map();
  for (const p of prices.filter(p => p.fuel_type === ft)) { if (!perStation.has(p.station_id)) perStation.set(p.station_id, []); perStation.get(p.station_id).push(p); }
  for (const [sid, arr] of perStation) {
    const latest = arr[0]; if (ageD(latest.reported_at) > FRESH_D) continue;
    const prev = arr.find(p => new Date(p.reported_at) < new Date(latest.reported_at) && ageD(p.reported_at) <= 45);
    if (!prev) continue; const drop = prev.price - latest.price;
    if (drop >= 0.03 && (!facts.biggestDrop || drop > facts.biggestDrop.dropCents / 100))
      facts.biggestDrop = { fuel: ft, label: stLabel(byId.get(sid)), from: prev.price, to: latest.price, dropCents: Math.round(drop * 100) };
  }
}

// ---------- deterministic drafts (always ship; the fallback) ----------
const c95 = facts.perFuel['Bensiin 95'].cheapest, cdie = facts.perFuel['Diisel'].cheapest;
const top3_95 = (() => { const fp = prices.filter(p => p.fuel_type === 'Bensiin 95'); const m = new Map(); for (const p of fp) if (!m.has(p.station_id)) m.set(p.station_id, p);
  return [...m.values()].filter(p => ageD(p.reported_at) <= FRESH_D).sort((a, b) => a.price - b.price).slice(0, 3).map(p => ({ label: stLabel(byId.get(p.station_id)), price: p.price })); })();
const dateStr = fmtDate(facts.generatedAt);
const det = {
  fb: `Igav lugu: tangid paagi täis, sõidad 2 km edasi — hind 20 senti odavam. 15 eurot ja hea tuju korraga läinud. 😅\n\n` +
    `Et seda vältida, tegin väikese ülevaate, kus Tallinnas sel nädalal kõige soodsam 95 on:\n` +
    top3_95.map(s => `• ${s.label} — ${eur(s.price)} €/l`).join('\n') +
    `\n(hinnad viimase nädala sisestustest)\n\n` +
    `Kui keegi teab täna mõnda veel soodsamat kohta, pange kommentaaridesse — täiendan hea meelega. ⛽\n\n` +
    `(Admin — kui selline postitus pole grupis lubatud, anna märku, kustutan kohe.)`,
  reddit: `**Vaatasin, kui palju Tallinna tanklate 95 hind sel nädalal erineb — vahe on suurem kui arvasin.**\n\n` +
    (c95 ? `Kõige odavam praegu ${eur(c95.price)} €/l (${c95.label}).` : '') +
    (facts.biggestDrop ? ` Suurim langus nädalaga: ${facts.biggestDrop.label} ${facts.biggestDrop.fuel} −${facts.biggestDrop.dropCents}s.` : '') +
    `\n\nAndmed korjame kokku kogukonnaga — igaüks lisab hinna, mille tanklas nägi (hinnasildi võib kaameraga pildistada, äpp loeb numbri ise). Tallinnas on kate juba päris hea, mujal veel õhuke. Kui kellelgi huvi vaadata või kaasa lüüa, kommentaaris link.`,
  ig: `Tallinna odavaim 95 sel nädalal 👇\n` + top3_95.map((s, i) => `${['🥇','🥈','🥉'][i]} ${s.label} — ${eur(s.price)} €/l`).join('\n') +
    `\n(seisuga ${dateStr}, kogukonna sisestatud)\n\n#kütus #kütusehinnad #tallinn #kyts #bensiin #diisel`,
};

// ---------- Gemini rewrite (rewriter only; numbers pre-baked) ----------
let drafts = det, geminiUsed = false, geminiNote = '';
const factSummary = [
  `Linn: Tallinn. Kuupäev: ${dateStr}.`,
  `Odavaim 95: ${c95 ? eur(c95.price) + ' €/l (' + c95.label + ')' : 'värsket andmed napib'}.`,
  `Odavaim diisel: ${cdie ? eur(cdie.price) + ' €/l (' + cdie.label + ')' : 'värsket andmed napib'}.`,
  `Top-3 odavaimat 95: ${top3_95.map(s => eur(s.price) + ' ' + s.label).join('; ')}.`,
  facts.biggestDrop ? `Suurim nädala langus: ${facts.biggestDrop.label} ${facts.biggestDrop.fuel} ${eur(facts.biggestDrop.from)}→${eur(facts.biggestDrop.to)} (−${facts.biggestDrop.dropCents}s).` : 'Suuri langusi sel nädalal ei olnud.',
].join('\n');

if (process.env.GEMINI_API_KEY) {
  try {
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Sa oled Eesti kütusehindade äpi "Kyts" sisuloome-abiline. Kirjuta EESTI keeles 3 mustandit (Facebook grupi-postitus, Reddit r/Eesti postitus, Instagrami pealkiri) alljärgnevate FAKTIDE põhjal.

RANGED REEGLID:
- ÄRA leiuta ega muuda ühtki numbrit — kasuta AINULT allolevaid fakte täpselt.
- Hääle reeglid: ${VOICE.rules.join(' | ')}
- Keelatud sõnad: ${VOICE.banned.join(', ')}.
- Facebook: esimene postitus grupis — puhas väärtus, ILMA lingita ja ILMA äpi nimeta, lõpus viisakas märkus adminile. Alusta valu-konksuga.
- Reddit: uudishimu/andmelugu, mitte reklaam; maini et link tuleb kommentaari.
- Instagram: lühike, top-3 nimekiri, 4-6 asjakohast eestikeelset silti.
- Tooni näited (jäljenda stiili, mitte sisu): ${VOICE.exemplars.map(e => '"' + e + '"').join(' ')}

FAKTID:
${factSummary}

Vasta AINULT JSON-ina kujul {"fb":"...","reddit":"...","ig":"..."} ilma muu tekstita.`;
    const res = await model.generateContent([prompt]);
    const raw = res.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    if (parsed.fb && parsed.reddit && parsed.ig) {
      const bad = VOICE.banned.filter(w => (parsed.fb + parsed.reddit + parsed.ig).toLowerCase().includes(w));
      if (bad.length) { geminiNote = `⚠️ Gemini kasutas keelatud sõnu (${bad.join(', ')}) → kasutan deterministlikku mustandit.`; }
      else { drafts = parsed; geminiUsed = true; }
    } else geminiNote = '⚠️ Gemini vastus polnud oodatud kujul → deterministlik mustand.';
  } catch (e) { geminiNote = `⚠️ Gemini ebaõnnestus (${String(e.message).slice(0, 80)}) → deterministlik mustand.`; }
} else geminiNote = 'ℹ️ GEMINI_API_KEY puudub → deterministlik mustand.';

// ---------- write the content pack ----------
const iso = facts.generatedAt.toISOString().slice(0, 10);
const factsTable = FUELS.map(([ft]) => { const f = facts.perFuel[ft]; return `| ${ft} | ${f.cheapest ? eur(f.cheapest.price) + ' € — ' + f.cheapest.label : '—'} | ${f.n} | ${f.wowDeltaCents == null ? '—' : (f.wowDeltaCents > 0 ? '+' : '') + f.wowDeltaCents + 's'} |`; }).join('\n');
const md = `# Kyts — sisupakk ${iso}  (${CITY.display})

> Genereeritud: ${geminiUsed ? 'Gemini (ümberkirjutaja) + ' : ''}deterministlik. ${geminiNote}
> ⚠️ **Loe üle enne postitamist.** Numbrid on päris andmetest (${dateStr} seisuga). Värskete numbrite jaoks jooksuta uuesti: \`node scripts/gen_content_pack.mjs\`
> Hääle-panga muutmiseks redigeeri \`VOICE\` selles skriptis.

## Nädala faktid (kontrolli)
| Kütus | Odavaim (värske ≤7p) | Värskeid jaamu | Nädala muutus (mediaan) |
|---|---|---|---|
${factsTable}

${facts.biggestDrop ? `**Suurim langus:** ${facts.biggestDrop.label} — ${facts.biggestDrop.fuel} ${eur(facts.biggestDrop.from)} → ${eur(facts.biggestDrop.to)} €/l (**−${facts.biggestDrop.dropCents}s**)` : '_Suuri hinnalangusi sel nädalal ei olnud._'}

---

## 📘 Facebook (esimene postitus grupis — ilma lingita)
${drafts.fb}

---

## 👽 Reddit (r/Eesti — link kommentaari)
${drafts.reddit}

---

## 📸 Instagram (pealkiri)
${drafts.ig}

---
*Kanalid (lisa lingile UTM): FB \`?ref=fb\` · Reddit \`?ref=reddit\` · IG \`?ref=ig\`. Postita 1 grupp / 2–3 nädalat, ära pasti sama teksti kõikjale korraga. Kohalolek (kommentaarid, vastused) on 80% tööst.*
`;

mkdirSync(join(here, '..', 'Notes', 'content-packs'), { recursive: true });
const out = join(here, '..', 'Notes', 'content-packs', `pack-${iso}.md`);
writeFileSync(out, md);
console.log(`Wrote Notes/content-packs/pack-${iso}.md`);
console.log(`Gemini used: ${geminiUsed}  ${geminiNote}`);
console.log('\n--- FB draft preview ---\n' + drafts.fb.slice(0, 400));
