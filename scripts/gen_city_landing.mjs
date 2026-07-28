// Generate a STANDALONE, human-visible SEO validation landing page for one city
// from REAL Supabase data, with honest freshness labels. No serverless, no React
// boot — a self-contained static HTML file the crowd data fills. Read-only DB.
//   node scripts/gen_city_landing.mjs
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- City config (Tallinn, widened to ~12km to include Peetri / the ring) ---
const CITY = {
  slug: 'tallinn', name: 'Tallinn', display: 'Tallinna',
  center: { lat: 59.437, lon: 24.7536 }, radiusKm: 12,
  cityTags: /tallinn|peetri|rae|lasname|mustam|õismäe|haabersti|kristiine|kadaka|ülemiste/i,
};
// Only show prices from the last DISPLAY_WINDOW days. Audit showed stale (>1wk)
// entries include outdated low outliers (e.g. a 22-day-old diesel far below the
// current market, and a 98<95 bad entry) — surfacing those as "cheapest now"
// would be misleading. Fresh-only keeps the page honest against the "reaalajas"
// promise; a fuel with no fresh data is simply omitted.
const DISPLAY_WINDOW_D = 7;
const INDEX_WINDOW_D = DISPLAY_WINDOW_D;
const FRESH_D = 7;           // a "cheapest now" figure is only trustworthy this fresh
const FUEL_ORDER = ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG'];
const FUEL_LABEL = { 'Bensiin 95': 'Bensiin 95', 'Bensiin 98': 'Bensiin 98', 'Diisel': 'Diisel', 'LPG': 'LPG (autogaas)' };
const TOP_N = 10;

const haversine = (a, b) => { const R = 6371, tr = d => d * Math.PI / 180;
  const dLat = tr(b.lat - a.lat), dLon = tr(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(tr(a.lat)) * Math.cos(tr(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s)); };
async function pageAll(table, cols, tweak) {
  const out = []; const step = 1000; let from = 0;
  while (true) { let q = sb.from(table).select(cols).range(from, from + step - 1); if (tweak) q = tweak(q);
    const { data, error } = await q; if (error) { console.error(table, error); process.exit(1); }
    out.push(...data); if (data.length < step) break; from += step; }
  return out;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const now = Date.now();
const ageDays = t => (now - new Date(t).getTime()) / 8.64e7;
const MONTHS = ['jaan', 'veebr', 'märts', 'apr', 'mai', 'juuni', 'juuli', 'aug', 'sept', 'okt', 'nov', 'dets'];
function fmtDate(t) { const d = new Date(t); return `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function fmtAge(t) { const a = ageDays(t); if (a < 1) return 'täna'; if (a < 2) return 'eile';
  if (a < 14) return `${Math.round(a)} p tagasi`; return fmtDate(t); }

// --- Pull data ---
const stations = await pageAll('stations', 'id, name, latitude, longitude, active, country, amenities');
const local = stations.filter(s => {
  if (s.active === false) return false;
  if (s.country && s.country !== 'EE' && s.country !== 'Estonia') return false;
  const city = (s.amenities && s.amenities['addr:city']) || '';
  const near = s.latitude != null && haversine(CITY.center, { lat: s.latitude, lon: s.longitude }) <= CITY.radiusKm;
  return CITY.cityTags.test(city) || near;
});
const byId = new Map(local.map(s => [s.id, s]));
const prices = await pageAll('prices', 'station_id, fuel_type, price, reported_at', q => q.order('reported_at', { ascending: false }));
const latest = new Map();
for (const p of prices) { if (!byId.has(p.station_id)) continue; const k = `${p.station_id}|${p.fuel_type}`; if (!latest.has(k)) latest.set(k, p); }

function stationLabel(s) {
  const brand = s.name || 'Tankla';
  const street = s.amenities && (s.amenities['addr:street'] || s.amenities['addr:place']);
  const hnr = s.amenities && s.amenities['addr:housenumber'];
  if (street) return `${brand} — ${street}${hnr ? ' ' + hnr : ''}`;
  return brand;
}
const perFuel = {};
for (const [, p] of latest) {
  if (ageDays(p.reported_at) > INDEX_WINDOW_D) continue;
  const s = byId.get(p.station_id);
  (perFuel[p.fuel_type] ||= []).push({ label: stationLabel(s), price: p.price, t: p.reported_at, fresh: ageDays(p.reported_at) <= FRESH_D });
}
for (const f of Object.keys(perFuel)) perFuel[f].sort((a, b) => a.price - b.price);

const fuels = FUEL_ORDER.filter(f => perFuel[f] && perFuel[f].length);
const allRows = fuels.flatMap(f => perFuel[f]);
const freshestT = allRows.reduce((m, r) => Math.max(m, new Date(r.t).getTime()), 0);
const stationCount = new Set(fuels.flatMap(f => perFuel[f].map(r => r.label))).size;
const indexable = allRows.length > 0;

console.log(`${CITY.name}: ${local.length} stations matched, ${stationCount} with a price ≤${INDEX_WINDOW_D}d`);
for (const f of fuels) { const c = perFuel[f][0]; console.log(`  ${f.padEnd(12)} cheapest ${c.price.toFixed(3)}€ ${c.fresh ? '(fresh)' : '(' + fmtAge(c.t) + ')'} n=${perFuel[f].length}`); }
console.log(`  freshest overall: ${fmtAge(new Date(freshestT).toISOString())}; indexable=${indexable}`);

// --- Build HTML ---
const CANON = `https://kyts.ee/linn/${CITY.slug}`;
const title = `${CITY.display} kütusehinnad — odavaim bensiin ja diisel | Kyts`;
const desc = `${CITY.display} tanklate kütusehinnad: 95, 98, diisel ja LPG. ${stationCount} tankla kogukonna teatatud hinda, uuendatud ${fmtDate(new Date(freshestT).toISOString())}.`;
const robots = indexable ? 'index,follow' : 'noindex,follow';

const fuelSections = fuels.map(f => {
  const rows = perFuel[f].slice(0, TOP_N);
  const cheapest = rows[0];
  const heroFresh = cheapest.fresh;
  const trs = rows.map((r, i) => `
        <tr${i === 0 ? ' class="best"' : ''}>
          <td class="rank">${i + 1}</td>
          <td class="stn">${esc(r.label)}</td>
          <td class="prc">${r.price.toFixed(3)} €</td>
          <td class="age${r.fresh ? ' fresh' : ''}">${esc(fmtAge(r.t))}</td>
        </tr>`).join('');
  return `
    <section class="fuel" id="fuel-${esc(f).replace(/\s+/g, '-').toLowerCase()}">
      <h2>${esc(FUEL_LABEL[f] || f)} — ${CITY.display}</h2>
      <p class="hero">Odavaim: <strong>${cheapest.price.toFixed(3)} €/l</strong> · ${esc(cheapest.label)}
        <span class="when${heroFresh ? ' fresh' : ''}">(${heroFresh ? 'uuendatud ' + esc(fmtAge(cheapest.t)) : 'viimati ' + esc(fmtAge(cheapest.t))})</span></p>
      <table>
        <thead><tr><th>#</th><th>Tankla</th><th>Hind</th><th>Uuendatud</th></tr></thead>
        <tbody>${trs}
        </tbody>
      </table>
    </section>`;
}).join('\n');

// JSON-LD: BreadcrumbList + one ItemList (cheapest diesel, the most-searched fuel)
const dieselList = perFuel['Diisel'] ? perFuel['Diisel'].slice(0, TOP_N) : [];
const jsonld = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Kyts', item: 'https://kyts.ee/' },
      { '@type': 'ListItem', position: 2, name: `${CITY.display} kütusehinnad`, item: CANON },
    ] },
    ...(dieselList.length ? [{ '@type': 'ItemList', name: `Odavaim diisel ${CITY.display}`,
      itemListElement: dieselList.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.label })) }] : []),
  ],
};

const html = `<!doctype html>
<html lang="et">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="robots" content="${robots}" />
<link rel="canonical" href="${CANON}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta name="theme-color" content="#0a0a0a" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Kyts" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${CANON}" />
<meta property="og:image" content="https://kyts.ee/logo.png" />
<meta property="og:locale" content="et_EE" />
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0a0a; color: #ececec;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 20px 16px 56px; }
  header { display: flex; align-items: center; gap: 10px; padding: 6px 0 18px; }
  header img { width: 32px; height: 32px; border-radius: 8px; }
  header a { color: #ececec; text-decoration: none; font-weight: 700; font-size: 18px; }
  nav.crumbs { font-size: 13px; color: #8a8a8a; margin-bottom: 6px; }
  nav.crumbs a { color: #8a8a8a; text-decoration: none; }
  h1 { font-size: 26px; margin: 4px 0 8px; }
  .lede { color: #b7b7b7; margin: 0 0 8px; }
  .freshnote { font-size: 13px; color: #8a8a8a; margin: 0 0 22px; }
  section.fuel { background: #141414; border: 1px solid #232323; border-radius: 14px; padding: 16px; margin: 0 0 16px; }
  section.fuel h2 { font-size: 17px; margin: 0 0 8px; }
  .hero { margin: 0 0 12px; font-size: 15px; }
  .hero strong { color: #58d68d; font-size: 17px; }
  .when { color: #8a8a8a; font-size: 12px; }
  .when.fresh { color: #58d68d; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: #8a8a8a; font-weight: 500; font-size: 12px; padding: 4px 8px; border-bottom: 1px solid #232323; }
  td { padding: 7px 8px; border-bottom: 1px solid #1c1c1c; }
  tr.best td { background: #16241b; }
  td.rank { color: #6a6a6a; width: 24px; }
  td.prc { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  td.age { color: #8a8a8a; font-size: 12px; white-space: nowrap; }
  td.age.fresh { color: #58d68d; }
  .cta { display: inline-block; margin: 8px 0 0; background: #ff7a1a; color: #111; font-weight: 700;
    text-decoration: none; padding: 12px 20px; border-radius: 12px; }
  footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #232323; font-size: 13px; color: #7a7a7a; }
  footer a { color: #9a9a9a; }
</style>
</head>
<body>
  <div class="wrap">
    <header><a href="/"><img src="/logo.png" alt="Kyts" width="32" height="32" /> Kyts</a></header>
    <nav class="crumbs"><a href="/">Kyts</a> › ${CITY.display} kütusehinnad</nav>
    <h1>${CITY.display} kütusehinnad</h1>
    <p class="lede">Kogukonna teatatud kütusehinnad ${CITY.display} tanklates — bensiin 95 ja 98, diisel ning LPG. Leia lähim odav tankla.</p>
    <p class="freshnote">${stationCount} tanklat viimase nädala hindadega · värskeim uuendus ${esc(fmtDate(new Date(freshestT).toISOString()))}. Hinnad on kogukonna sisestatud ja võivad muutuda — iga hinna juures on näidatud selle vanus.</p>

${fuelSections}

    <a class="cta" href="/">Vaata kõiki ${CITY.display} tanklaid kaardil →</a>

    <footer>
      <p><strong>Kyts</strong> — Eesti kütusehindade kogukonnakaart. Hinnad sisestavad kasutajad; kontrolli alati tanklas.</p>
      <p><a href="/">Avaleht ja kaart</a> · <a href="/privacy.html">Privaatsus</a> · <a href="/terms.html">Tingimused</a></p>
    </footer>
  </div>
</body>
</html>
`;

mkdirSync(join(here, '..', 'public', 'linn'), { recursive: true });
writeFileSync(join(here, '..', 'public', 'linn', `${CITY.slug}.html`), html);
console.log(`\nWrote public/linn/${CITY.slug}.html (${html.length} bytes, robots=${robots})`);
