// Live SEO landing pages: /linn/:slug and /maakond/:slug.
//
// WHY LIVE, AND WHY STANDALONE. The July probe (/linn/tallinn) was a static
// file from scripts/gen_city_landing.mjs — a standalone HTML page with no React
// boot, chosen so bot HTML and human HTML are identical and the app is
// untouched. That choice was right; the static part was not: the page claimed
// "last week's prices" and was two months old when this replaced it. So this
// is the SAME page, rendered per request from the database and edge-cached.
//
// It deliberately does NOT follow Notes/SEO_PHASE1_DESIGN.md's hybrid (lander
// under the booted app). That design carried four blocker-class risks — asset
// hash skew, the lander surviving WRS, overlay-history corruption, LCP — all of
// which exist only because the app boots on top. A standalone page with a
// "see it on the map" link has none of them.
//
// HONESTY RULES, carried over from the probe:
//  - Only prices from the last DISPLAY_DAYS are shown. Older ones included
//    outliers (a 22-day-old diesel far below market) that would read as
//    "cheapest now".
//  - A page is indexable only if at least MIN_FRESH_STATIONS stations have such
//    a price. Below that it still renders (a shared link works) but is noindex
//    and left out of the sitemap. Measured 2026-09-28: 2 of 15 counties pass.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const DISPLAY_DAYS = 7;
export const MIN_FRESH_STATIONS = 3;
const TOP_N = 10;
const FUEL_ORDER = ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG'] as const;
const FUEL_LABEL: Record<string, string> = {
  'Bensiin 95': 'Bensiin 95', 'Bensiin 98': 'Bensiin 98', 'Diisel': 'Diisel', 'LPG': 'LPG (autogaas)',
};

export function supabaseAdmin(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server missing Supabase credentials.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Estonian letters mapped explicitly — NFD folding of õ is not reliable. */
export function slugify(s: string): string {
  const map: Record<string, string> = { õ: 'o', ä: 'a', ö: 'o', ü: 'u', š: 's', ž: 'z' };
  return s.toLowerCase().replace(/[õäöüšž]/g, (c) => map[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** "Harju maakond" → "harjumaa", "Lääne-Viru maakond" → "laane-virumaa". */
export function countySlug(name: string): string {
  return slugify(name.replace(/\s*maakond$/i, '')) + 'maa';
}
/** "Harju maakond" → "Harjumaa", the form Estonians search for. */
function countyShort(name: string): string {
  return name.replace(/\s*maakond$/i, '') + 'maa';
}

type Station = { id: string; name: string | null; latitude: number; longitude: number; parish_id: number | null; amenities: Record<string, any> | null };
type Price = { station_id: string; fuel_type: string; price: number; reported_at: string };
type Row = { label: string; price: number; t: string };

export type Page =
  | { status: 404 }
  | {
      status: 200;
      canonical: string;
      title: string;
      h1: string;
      lede: string;
      crumbs: Array<{ name: string; href: string }>;
      perFuel: Array<{ fuel: string; rows: Row[] }>;
      freshStations: number;
      totalStations: number;
      freshest: string | null;
      indexable: boolean;
      related: Array<{ name: string; href: string }>;
      /** Where "see it on the map" should land. */
      mapHref: string;
    };

// ── Cities ───────────────────────────────────────────────────────────────────
// Kept as a hand table: a city is not an admin unit in the catalog (Tallinn is
// one of Harju's parishes, but "Tallinn" as searched includes Peetri and the
// ring road), so its footprint is a centre + radius + address hints, exactly
// as the July probe defined it. Add a city here once it has fresh prices.
const CITIES: Record<string, { name: string; genitive: string; lat: number; lon: number; radiusKm: number; tags: RegExp; county: string }> = {
  tallinn: {
    name: 'Tallinn', genitive: 'Tallinna', lat: 59.437, lon: 24.7536, radiusKm: 12,
    tags: /tallinn|peetri|rae|lasname|mustam|õismäe|haabersti|kristiine|kadaka|ülemiste/i,
    county: 'harjumaa',
  },
};
export const CITY_SLUGS = Object.keys(CITIES);

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

async function pageAll<T>(sb: SupabaseClient, table: string, cols: string, tweak: (q: any) => any): Promise<T[]> {
  // PostgREST caps every response at 1,000 rows — page until a short one.
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await tweak(sb.from(table).select(cols)).range(from, from + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function freshPrices(sb: SupabaseClient, stationIds: string[]): Promise<Price[]> {
  const since = new Date(Date.now() - DISPLAY_DAYS * 864e5).toISOString();
  const out: Price[] = [];
  // Chunked: an `in` list of a few hundred uuids is a long URL.
  for (let i = 0; i < stationIds.length; i += 150) {
    const ids = stationIds.slice(i, i + 150);
    out.push(...await pageAll<Price>(sb, 'prices', 'station_id, fuel_type, price, reported_at',
      (q) => q.in('station_id', ids).gte('reported_at', since).order('reported_at', { ascending: false })));
  }
  return out;
}

function stationLabel(s: Station): string {
  const brand = s.name || 'Tankla';
  const a = s.amenities ?? {};
  const street = a['addr:street'] || a['addr:place'];
  const city = a['addr:city'];
  if (street) return `${brand} — ${street}${a['addr:housenumber'] ? ' ' + a['addr:housenumber'] : ''}${city ? ', ' + city : ''}`;
  return city ? `${brand} — ${city}` : brand;
}

function tabulate(stations: Station[], prices: Price[]) {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const latest = new Map<string, Price>();
  for (const p of prices) {
    if (!byId.has(p.station_id)) continue;
    const k = `${p.station_id}|${p.fuel_type}`;
    if (!latest.has(k)) latest.set(k, p);          // prices arrive newest-first
  }
  const perFuel = new Map<string, Row[]>();
  const fresh = new Set<string>();
  let freshest = 0;
  for (const p of latest.values()) {
    fresh.add(p.station_id);
    freshest = Math.max(freshest, new Date(p.reported_at).getTime());
    const list = perFuel.get(p.fuel_type) ?? [];
    list.push({ label: stationLabel(byId.get(p.station_id)!), price: Number(p.price), t: p.reported_at });
    perFuel.set(p.fuel_type, list);
  }
  return {
    perFuel: FUEL_ORDER.filter((f) => perFuel.get(f)?.length)
      .map((f) => ({ fuel: f, rows: perFuel.get(f)!.sort((a, b) => a.price - b.price).slice(0, TOP_N) })),
    freshStations: fresh.size,
    freshest: freshest ? new Date(freshest).toISOString() : null,
  };
}

type County = { id: number; name: string; slug: string };

export async function listCounties(sb: SupabaseClient): Promise<County[]> {
  const { data, error } = await sb.from('maakonnad').select('id, name, country').order('name');
  if (error) throw error;
  return (data ?? [])
    .filter((m: any) => (m.country ?? 'EE') === 'EE')
    .map((m: any) => ({ id: m.id, name: m.name, slug: countySlug(m.name) }));
}

async function countyStations(sb: SupabaseClient, countyId: number): Promise<Station[]> {
  const { data: parishes, error } = await sb.from('parishes').select('id').eq('maakond_id', countyId);
  if (error) throw error;
  const ids = (parishes ?? []).map((p: any) => p.id);
  if (!ids.length) return [];
  return pageAll<Station>(sb, 'stations', 'id, name, latitude, longitude, parish_id, amenities',
    (q) => q.in('parish_id', ids).eq('active', true));
}

export async function buildCountyPage(sb: SupabaseClient, slug: string): Promise<Page> {
  const counties = await listCounties(sb);
  const county = counties.find((c) => c.slug === slug);
  if (!county) return { status: 404 };
  const stations = await countyStations(sb, county.id);
  const t = tabulate(stations, await freshPrices(sb, stations.map((s) => s.id)));
  const short = countyShort(county.name);
  const related = [
    ...Object.entries(CITIES).filter(([, c]) => c.county === slug)
      .map(([s, c]) => ({ name: `${c.genitive} kütusehinnad`, href: `/linn/${s}` })),
    ...counties.filter((c) => c.slug !== slug).map((c) => ({ name: countyShort(c.name), href: `/maakond/${c.slug}` })),
  ];
  return {
    status: 200,
    canonical: `https://kyts.ee/maakond/${slug}`,
    title: `Kütusehinnad ${short}l — odavaim bensiin ja diisel | Kyts`,
    h1: `Kütusehinnad ${short}l`,
    lede: `Kogukonna teatatud kütusehinnad ${short} ${stations.length} tanklas — bensiin 95 ja 98, diisel ning LPG.`,
    crumbs: [{ name: 'Kyts', href: '/' }, { name: short, href: `/maakond/${slug}` }],
    ...t,
    totalStations: stations.length,
    indexable: t.freshStations >= MIN_FRESH_STATIONS,
    related,
    mapHref: '/',
  };
}

export async function buildCityPage(sb: SupabaseClient, slug: string): Promise<Page> {
  const city = CITIES[slug];
  if (!city) return { status: 404 };
  const all = await pageAll<Station & { country: string | null }>(sb, 'stations',
    'id, name, latitude, longitude, parish_id, amenities, country',
    (q) => q.eq('active', true).eq('country', 'EE'));
  const stations = all.filter((s) =>
    city.tags.test(String(s.amenities?.['addr:city'] ?? ''))
    || (s.latitude != null && haversineKm(city.lat, city.lon, s.latitude, s.longitude) <= city.radiusKm));
  const t = tabulate(stations, await freshPrices(sb, stations.map((s) => s.id)));
  const counties = await listCounties(sb);
  const parent = counties.find((c) => c.slug === city.county);
  return {
    status: 200,
    canonical: `https://kyts.ee/linn/${slug}`,
    title: `${city.genitive} kütusehinnad — odavaim bensiin ja diisel | Kyts`,
    h1: `${city.genitive} kütusehinnad`,
    lede: `Kogukonna teatatud kütusehinnad ${city.genitive} tanklates — bensiin 95 ja 98, diisel ning LPG. Leia lähim odav tankla.`,
    crumbs: [
      { name: 'Kyts', href: '/' },
      ...(parent ? [{ name: countyShort(parent.name), href: `/maakond/${parent.slug}` }] : []),
      { name: `${city.genitive} kütusehinnad`, href: `/linn/${slug}` },
    ],
    ...t,
    totalStations: stations.length,
    indexable: t.freshStations >= MIN_FRESH_STATIONS,
    related: parent ? [{ name: countyShort(parent.name), href: `/maakond/${parent.slug}` }] : [],
    mapHref: '/',
  };
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['jaan', 'veebr', 'märts', 'apr', 'mai', 'juuni', 'juuli', 'aug', 'sept', 'okt', 'nov', 'dets'];
// Rendered in Estonian local time: a 23:30 UTC report is "tomorrow" in Tallinn.
function tallinn(t: string) {
  const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'Europe/Tallinn' }));
  return d;
}
function fmtDate(t: string) { const d = tallinn(t); return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function fmtAge(t: string) {
  const days = (Date.now() - new Date(t).getTime()) / 864e5;
  if (days < 1) return 'täna';
  if (days < 2) return 'eile';
  return `${Math.round(days)} p tagasi`;
}

export function renderHtml(p: Extract<Page, { status: 200 }>): string {
  const desc = p.freshStations
    ? `${p.h1}: 95, 98, diisel ja LPG. ${p.freshStations} tankla värsked kogukonna hinnad, uuendatud ${fmtDate(p.freshest!)}.`
    : `${p.h1}: kogukonna teatatud kütusehinnad Kyts kaardil.`;
  const sections = p.perFuel.map(({ fuel, rows }) => `
    <section class="fuel">
      <h2>${esc(FUEL_LABEL[fuel] ?? fuel)}</h2>
      <p class="hero">Odavaim: <strong>${rows[0].price.toFixed(3)} €/l</strong> · ${esc(rows[0].label)}
        <span class="when">(uuendatud ${esc(fmtAge(rows[0].t))})</span></p>
      <table>
        <thead><tr><th>#</th><th>Tankla</th><th>Hind</th><th>Uuendatud</th></tr></thead>
        <tbody>${rows.map((r, i) => `
          <tr${i === 0 ? ' class="best"' : ''}><td class="rank">${i + 1}</td><td>${esc(r.label)}</td><td class="prc">${r.price.toFixed(3)} €</td><td class="age">${esc(fmtAge(r.t))}</td></tr>`).join('')}
        </tbody>
      </table>
    </section>`).join('\n');
  const empty = p.perFuel.length ? '' : `
    <section class="fuel empty">
      <p>Viimase ${DISPLAY_DAYS} päeva jooksul pole siin ühtegi hinda teatatud. Kyts näitab ainult värskeid hindu — vanemad võivad olla eksitavad.</p>
      <p>Oled tanklas? Lisa hind kaardil — see võtab paar sekundit.</p>
    </section>`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: p.crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `https://kyts.ee${c.href}` })) },
      ...p.perFuel.filter((f) => f.fuel === 'Diisel').map((f) => ({
        '@type': 'ItemList', name: `Odavaim diisel — ${p.h1}`,
        itemListElement: f.rows.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.label })),
      })),
    ],
  };
  return `<!doctype html>
<html lang="et">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="robots" content="${p.indexable ? 'index,follow' : 'noindex,follow'}" />
<link rel="canonical" href="${p.canonical}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta name="theme-color" content="#0a0a0a" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Kyts" />
<meta property="og:title" content="${esc(p.title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${p.canonical}" />
<meta property="og:image" content="https://kyts.ee/logo.png" />
<meta property="og:locale" content="et_EE" />
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0a0a; color: #ececec; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 20px 16px 56px; }
  header { display: flex; align-items: center; gap: 10px; padding: 6px 0 18px; }
  header img { width: 32px; height: 32px; border-radius: 8px; }
  header a { color: #ececec; text-decoration: none; font-weight: 700; font-size: 18px; display: flex; gap: 10px; align-items: center; }
  nav.crumbs { font-size: 13px; color: #8a8a8a; margin-bottom: 6px; }
  nav.crumbs a { color: #8a8a8a; text-decoration: none; }
  h1 { font-size: 26px; margin: 4px 0 8px; }
  .lede { color: #b7b7b7; margin: 0 0 8px; }
  .freshnote { font-size: 13px; color: #8a8a8a; margin: 0 0 22px; }
  section.fuel { background: #141414; border: 1px solid #232323; border-radius: 14px; padding: 16px; margin: 0 0 16px; }
  section.fuel h2 { font-size: 17px; margin: 0 0 8px; }
  section.empty p { margin: 0 0 8px; color: #b7b7b7; }
  .hero { margin: 0 0 12px; font-size: 15px; }
  .hero strong { color: #58d68d; font-size: 17px; }
  .when { color: #58d68d; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: #8a8a8a; font-weight: 500; font-size: 12px; padding: 4px 8px; border-bottom: 1px solid #232323; }
  td { padding: 7px 8px; border-bottom: 1px solid #1c1c1c; }
  tr.best td { background: #16241b; }
  td.rank { color: #6a6a6a; width: 24px; }
  td.prc { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  td.age { color: #58d68d; font-size: 12px; white-space: nowrap; }
  .cta { display: inline-block; margin: 8px 0 0; background: #ff7a1a; color: #111; font-weight: 700; text-decoration: none; padding: 12px 20px; border-radius: 12px; }
  .related { margin-top: 28px; font-size: 14px; }
  .related a { color: #9ab; margin-right: 12px; display: inline-block; }
  footer { margin-top: 30px; padding-top: 16px; border-top: 1px solid #232323; font-size: 13px; color: #7a7a7a; }
  footer a { color: #9a9a9a; }
</style>
</head>
<body>
  <div class="wrap">
    <header><a href="/"><img src="/logo.png" alt="" width="32" height="32" /> Kyts</a></header>
    <nav class="crumbs">${p.crumbs.map((c, i) => i === p.crumbs.length - 1 ? esc(c.name) : `<a href="${c.href}">${esc(c.name)}</a>`).join(' › ')}</nav>
    <h1>${esc(p.h1)}</h1>
    <p class="lede">${esc(p.lede)}</p>
    <p class="freshnote">${p.freshStations ? `${p.freshStations} ${p.freshStations === 1 ? 'tankla' : 'tanklat'} viimase ${DISPLAY_DAYS} päeva hindadega · värskeim uuendus ${esc(fmtDate(p.freshest!))}. ` : ''}Hinnad on kogukonna sisestatud ja võivad muutuda — iga hinna juures on näidatud selle vanus.</p>
${sections}${empty}
    <a class="cta" href="${p.mapHref}">Ava kaart ja vaata kõiki tanklaid →</a>
${p.related.length ? `    <nav class="related"><strong>Vaata ka:</strong><br/>${p.related.map((r) => `<a href="${r.href}">${esc(r.name)}</a>`).join(' ')}</nav>` : ''}
    <footer>
      <p><strong>Kyts</strong> — kütusehindade kogukonnakaart. Hinnad sisestavad kasutajad; kontrolli alati tanklas.</p>
      <p><a href="/">Avaleht ja kaart</a> · <a href="/privacy.html">Privaatsus</a> · <a href="/terms.html">Tingimused</a></p>
    </footer>
  </div>
</body>
</html>
`;
}

export function render404(): string {
  return `<!doctype html><html lang="et"><head><meta charset="UTF-8" /><meta name="robots" content="noindex" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Lehte ei leitud | Kyts</title>
<style>body{margin:0;background:#0a0a0a;color:#ececec;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center}a{color:#ff7a1a}</style>
</head><body><div><h1>Lehte ei leitud</h1><p><a href="/">Ava Kyts kaart →</a></p></div></body></html>`;
}
