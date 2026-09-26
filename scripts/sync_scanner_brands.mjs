// Keep the scanner's brand whitelist in step with CHAIN_PATTERNS.
//
//   node scripts/sync_scanner_brands.mjs            # check, non-zero exit on drift
//   node scripts/sync_scanner_brands.mjs --write    # rewrite the block
//
// WHY THIS EXISTS. api/parse-prices.ts cannot import from src/ — Vercel builds
// serverless functions from api/ alone — so ALLOWED_BRANDS duplicates the
// canonical names in src/utils.ts CHAIN_PATTERNS. It was hand-maintained, and it
// drifted: by 2026-09-26 it was missing every Lithuanian and Finnish chain, 24
// brands covering 1,568 of 3,662 active stations. Those scans still returned
// prices (a null brand is treated as a match) but the brand-confirmation step
// was silently dead for 43% of the network.
//
// Generated + gated beats hand-maintained: add a chain to CHAIN_PATTERNS and run
// this, and the scanner learns it too.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const UTILS = join(repo, 'src', 'utils.ts');
const API = join(repo, 'api', 'parse-prices.ts');
const write = process.argv.includes('--write');

const utils = readFileSync(UTILS, 'utf8');
const block = utils.slice(utils.indexOf('const CHAIN_PATTERNS'), utils.indexOf('// Diacritics are folded'));
// Order of first appearance, deduped — several patterns share a canonical
// (Saare Kütus has six, GoOil two), and the prompt only needs each name once.
const canonical = [...new Set([...block.matchAll(/canonical:\s*'([^']+)'/g)].map(m => m[1]))];
if (canonical.length < 20) {
  console.error(`Only ${canonical.length} canonical brands parsed — the CHAIN_PATTERNS shape probably changed.`);
  process.exit(2);
}

const api = readFileSync(API, 'utf8');
const startMarker = 'const ALLOWED_BRANDS = [';
const endMarker = '] as const;';
const start = api.indexOf(startMarker);
const end = api.indexOf(endMarker, start);
if (start === -1 || end === -1) {
  console.error('Could not locate the ALLOWED_BRANDS block in api/parse-prices.ts.');
  process.exit(2);
}

const current = [...api.slice(start, end).matchAll(/'([^']+)'/g)].map(m => m[1]);
const missing = canonical.filter(b => !current.includes(b));
const extra = current.filter(b => !canonical.includes(b));

// Wrap at ~76 chars so the generated block stays readable in review.
const lines = [];
let line = ' ';
for (const b of canonical) {
  const piece = ` '${b}',`;
  if ((line + piece).length > 76) { lines.push(line); line = ' '; }
  line += piece;
}
if (line.trim()) lines.push(line);

const generated = `${startMarker}
  // GENERATED — do not edit by hand. Run: node scripts/sync_scanner_brands.mjs --write
  // Mirrors the canonical names in src/utils.ts CHAIN_PATTERNS, which is what
  // getBrand() can ever return. Kept as a copy because Vercel builds api/ on its
  // own and it cannot import from src/.
${lines.join('\n')}
`;

if (!missing.length && !extra.length) {
  console.log(`In sync — ${canonical.length} brands.`);
  process.exit(0);
}

console.log(`DRIFT: ${missing.length} missing from the scanner, ${extra.length} unknown to CHAIN_PATTERNS.`);
if (missing.length) console.log('  missing:', missing.join(', '));
if (extra.length) console.log('  extra:  ', extra.join(', '));

if (!write) {
  console.log('\nRun with --write to regenerate.');
  process.exit(1);
}
writeFileSync(API, api.slice(0, start) + generated + api.slice(end), 'utf8');
console.log(`\nRewrote ALLOWED_BRANDS with ${canonical.length} brands.`);
