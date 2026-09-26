// Gate for the camera scanner's country/currency contract (phase C of
// Notes/Plan_Local_Currency.md).
//
//   npm run verify:scanner
//
// The scanner DROPS any price outside its per-currency range, so a gap here does
// not degrade — it returns an empty scan on a perfectly good photo. Two classes
// of silent failure this catches:
//
//   A currency the client can send but the API has no ranges for. Sweden would
//   have hit this: 17.49 SEK sits far outside the euro bands.
//
//   A chain the app knows but the scanner's brand whitelist does not. That had
//   already happened: by 2026-09-26 ALLOWED_BRANDS was missing every Lithuanian
//   and Finnish chain — 24 brands over 1,568 of 3,662 active stations — because
//   it was hand-maintained beside CHAIN_PATTERNS instead of generated from it.

import { readFileSync } from 'node:fs';
import { CURRENCY_CODES, COUNTRIES, COUNTRY_CODES } from '../src/constants/countries.ts';

const api = readFileSync(new URL('../api/parse-prices.ts', import.meta.url), 'utf8');
const utils = readFileSync(new URL('../src/utils.ts', import.meta.url), 'utf8');

let fail = 0;
const check = (label, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`);
};

console.log('\n── every currency the client can send has scan ranges ──');
const scanBlock = api.slice(api.indexOf('const CURRENCY_SCAN'), api.indexOf('type ScanCurrency'));
for (const cur of CURRENCY_CODES) {
  check(`${cur} present in CURRENCY_SCAN`, new RegExp(`\\b${cur}:\\s*\\{`).test(scanBlock),
    new RegExp(`\\b${cur}:\\s*\\{`).test(scanBlock) ? '' : 'scans in this currency would come back empty');
}

console.log('\n── every live country maps to a currency with ranges ──');
for (const cc of COUNTRY_CODES) {
  const cur = COUNTRIES[cc].currency;
  check(`${cc} -> ${cur}`, new RegExp(`\\b${cur}:\\s*\\{`).test(scanBlock));
}

console.log('\n── ranges are ordered and cover the four tracked fuels ──');
for (const cur of CURRENCY_CODES) {
  const seg = scanBlock.slice(scanBlock.indexOf(`${cur}: {`));
  const ranges = [...seg.slice(0, seg.indexOf('},')).matchAll(/'([^']+)':\s*\[\s*([\d.]+),\s*([\d.]+)\s*\]/g)];
  const fuels = ranges.map(m => m[1]);
  for (const f of ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG']) {
    check(`${cur} has a range for ${f}`, fuels.includes(f));
  }
  for (const [, f, lo, hi] of ranges) {
    check(`${cur} ${f} lo < hi`, Number(lo) < Number(hi), `${lo}–${hi}`);
  }
  // LPG is always the cheapest product on a forecourt; if its band overlapped
  // petrol's the prompt's own "LPG is ALWAYS cheaper" rule would contradict it.
  const lpg = ranges.find(m => m[1] === 'LPG');
  const b95 = ranges.find(m => m[1] === 'Bensiin 95');
  if (lpg && b95) check(`${cur} LPG band sits below petrol`, Number(lpg[3]) < Number(b95[3]),
    `LPG max ${lpg[3]} vs 95 max ${b95[3]}`);
}

console.log('\n── the scanner knows every brand the app can name ──');
const chainBlock = utils.slice(utils.indexOf('const CHAIN_PATTERNS'), utils.indexOf('// Diacritics are folded'));
const canonical = [...new Set([...chainBlock.matchAll(/canonical:\s*'([^']+)'/g)].map(m => m[1]))];
const allowedBlock = api.slice(api.indexOf('const ALLOWED_BRANDS = ['), api.indexOf('] as const;'));
const allowed = new Set([...allowedBlock.matchAll(/'([^']+)'/g)].map(m => m[1]));
const missing = canonical.filter(b => !allowed.has(b));
check(`all ${canonical.length} CHAIN_PATTERNS brands are whitelisted`, missing.length === 0,
  missing.length ? `missing: ${missing.join(', ')} — run scripts/sync_scanner_brands.mjs --write` : '');

console.log('\n── the prompt forbids conversion and names the currency ──');
check('prompt states the currency', api.includes('The prices on this sign are in ${currency}'));
check('prompt forbids converting',  /never convert to another currency/i.test(api));
check('range hint is built from the table, not literals',
  !/Realistic Baltic \(EE\/LV\/LT\) price ranges/.test(api),
  'the old euro-only hint is gone');
check('server filter shares the prompt table', api.includes('const FUEL_RANGES = money.ranges'));

console.log('\n── row labels cover every live country ──');
// A label the totem uses but the prompt has never seen reads as an unknown fuel
// and the scan returns empty.
for (const [label, needle] of [
  ['Latvian diesel',    'Dīzeļdegviela'],
  ['Lithuanian diesel', 'Dyzelinas'],
  ['Finnish petrol',    'Bensiini 95'],
  ['Finnish diesel',    'Dieselöljy'],
  ['Swedish petrol',    'Bensin 95'],
  ['Finnish LPG',       'Nestekaasu'],
  ['Swedish LPG',       'Gasol'],
]) check(`${label} label present`, api.includes(needle));

check('untracked fuels are explicitly ignored', /IGNORE these rows entirely/.test(api) && api.includes('E85') && api.includes('HVO'));
check('no-hint prompt is not still two-country', !/unknown Estonian or Latvian fuel station/.test(api));

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
