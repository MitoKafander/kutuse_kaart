// Which raw station names does each CHAIN_PATTERNS entry actually swallow?
//
//   npm run measure:chains            brands whose members are not all named alike
//   npm run measure:chains -- BP Avia  just those brands
//
// CHAIN_PATTERNS is first-match-wins and substring-based, so every pattern is
// a bet that its letters never occur inside an unrelated name in ANY of the
// nine countries — `ok` inside Biokaasu, `amic` inside Dynamic, `q8` inside
// OKQ8. Each of those was found by an ad-hoc query typed during the country
// that introduced it. This is that query, written down once, run against the
// live catalog: for every collector brand it lists the distinct raw names that
// produce it, per country, so a stray is a line you can read rather than a
// row nobody looks at until a Norwegian sees a Polish chain on their map.
//
// It cannot tell a false positive from a legitimate variant — "Amic Energy"
// and "Dynamic Gas & Wash" both contain "amic" — which is why it prints names
// for a human, not verdicts.

import { getBrand } from '../src/utils.ts';
import { fetchAll } from './_lib/db.mjs';

const only = new Set(process.argv.slice(2).map((a) => a.toLowerCase()));

const rows = await fetchAll('stations', 'name, country', (q) => q.eq('active', true));

// brand -> raw name -> country -> n
const byBrand = new Map();
for (const r of rows) {
  const name = (r.name ?? '').trim();
  if (!name) continue;
  const brand = getBrand(name);
  let names = byBrand.get(brand);
  if (!names) byBrand.set(brand, (names = new Map()));
  let per = names.get(name);
  if (!per) names.set(name, (per = new Map()));
  per.set(r.country, (per.get(r.country) ?? 0) + 1);
}

const fmt = (per) => [...per].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ');

const brands = [...byBrand]
  .filter(([brand, names]) => (only.size ? only.has(brand.toLowerCase()) : names.size >= 2))
  .map(([brand, names]) => ({ brand, names, total: [...names.values()].reduce((s, per) => s + [...per.values()].reduce((a, b) => a + b, 0), 0) }))
  .sort((a, b) => b.total - a.total);

for (const { brand, names, total } of brands) {
  const countries = new Set();
  for (const per of names.values()) for (const c of per.keys()) countries.add(c);
  console.log(`\n${brand} — ${total} stations, ${names.size} distinct names, ${[...countries].sort().join('/')}`);
  const sorted = [...names].sort((a, b) => {
    const na = [...a[1].values()].reduce((x, y) => x + y, 0);
    const nb = [...b[1].values()].reduce((x, y) => x + y, 0);
    return nb - na;
  });
  // Exact-name members first as one line; the variants are the point.
  for (const [name, per] of sorted) {
    const exact = name.toLowerCase() === brand.toLowerCase();
    console.log(`  ${exact ? '=' : '·'} ${name.padEnd(44)} ${fmt(per)}`);
  }
}
console.log(`\n${rows.length} active stations, ${byBrand.size} collector brands, ${brands.length} listed.`);
