// Gate for phase A of Notes/Plan_Local_Currency.md: currency support must be
// INERT for the four eurozone countries. It imports the real source rather than
// a copy, so it fails if formatPrice drifts.
//
//   node --experimental-strip-types --import ./scripts/_ts_resolve_hook_register.mjs \
//        scripts/verify_currency_rendering.mjs
//
// Or just: npm run verify:currency
//
// Two things it proves:
//   1. Every euro string the app renders is byte-identical to what it printed
//      before currencies existed. The expected values below are lifted from the
//      literals that were replaced (`€${x.toFixed(3)}`, `${d*100}¢`, …).
//   2. Every currency-bound locale key interpolates fully, in all six locales,
//      for EUR and SEK alike — a missing variable leaves a raw {{token}} on
//      screen, which no typecheck catches.

import { readFileSync } from 'node:fs';
import { formatPrice, formatSubunitDelta, priceUnit, subunitUnit, pricePlaceholder } from '../src/utils.ts';
import { CURRENCIES, COUNTRY_CODES, currencyForCountry } from '../src/constants/countries.ts';

let fail = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(48)} ${JSON.stringify(got)}${ok ? '' : ` != ${JSON.stringify(want)}`}`);
};

console.log('\n── every live country is still euro, so nothing should move ──');
for (const cc of COUNTRY_CODES) {
  check(`${cc} -> EUR`, currencyForCountry(cc), 'EUR');
}

console.log('\n── euro output identical to the replaced literals ──');
check('price 3dp',                formatPrice(1.789, 'EUR'),        '€1.789');
check('price trailing zeros',     formatPrice(1.6, 'EUR'),          '€1.600');
check('price 2dp (chart axis)',   formatPrice(1.789, 'EUR', 2),     '€1.79');
check('subunit delta',            formatSubunitDelta(0.025, 'EUR'), '2.5¢');
check('subunit delta rounding',   formatSubunitDelta(0.005, 'EUR'), '0.5¢');
check('price unit',               priceUnit('EUR'),                 '€/l');
check('subunit unit',             subunitUnit('EUR'),               '¢/l');
check('input placeholder',        pricePlaceholder('EUR'),          '0,000');

console.log('\n── Swedish output follows the pump, not the interface language ──');
check('price',                    formatPrice(17.49, 'SEK'),        '17,49 kr');
check('price trailing zero',      formatPrice(20, 'SEK'),           '20,00 kr');
check('subunit delta',            formatSubunitDelta(0.025, 'SEK'), '2,5 öre');
check('price unit',               priceUnit('SEK'),                 'kr/l');
check('subunit unit',             subunitUnit('SEK'),               'öre/l');
check('input placeholder',        pricePlaceholder('SEK'),          '00,00');

console.log('\n── absent prices render a dash, never "NaN" or "€undefined" ──');
for (const [label, v] of [['null', null], ['undefined', undefined], ['NaN', NaN]]) {
  check(`price ${label}`, formatPrice(v, 'EUR'), '—');
  check(`subunit ${label}`, formatSubunitDelta(v, 'EUR'), '—');
}

console.log('\n── currency-bound locale keys interpolate fully ──');
// Mirrors what the components pass; a key gaining a variable without every
// caller supplying it is the failure this catches.
const CASES = {
  'manualPrice.alert.priceRange':       ['type', 'value', 'lo', 'hi', 'currency'],
  'manualPrice.submitError.outOfBand':  ['fuel', 'price', 'lo', 'hi', 'currency'],
  'manualPrice.submitError.outOfRange': ['price', 'lo', 'hi', 'currency'],
  'profile.settings.loyalty.help':      ['unit'],
};
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

for (const loc of ['et', 'en', 'ru', 'fi', 'lv', 'lt']) {
  const dict = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${loc}.json`, import.meta.url), 'utf8'));
  for (const [key, vars] of Object.entries(CASES)) {
    const tpl = get(dict, key);
    if (typeof tpl !== 'string') { fail++; console.log(`FAIL  ${loc} ${key} missing`); continue; }
    let out = tpl;
    for (const v of vars) out = out.replaceAll(`{{${v}}}`, '·');
    const leftover = out.match(/\{\{[^}]+\}\}/g);
    const ok = !leftover;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${(loc + ' ' + key).padEnd(48)} ${ok ? 'all vars supplied' : `unsupplied: ${leftover.join(', ')}`}`);
  }
}

console.log('\n── the client parses what the DB triggers actually raise ──');
// Messages copied verbatim from the phase-68 rehearsal run.
const BAND = /price (\d+\.\d+) outside band for (.+?)(?: in [A-Z]{2})? \(median \d+\.\d+, expected (\d+\.\d+) to (\d+\.\d+)\)/;
const RANGE = /price ([\d.]+) outside allowed range for (\w+) \(expected ([\d.]+) to ([\d.]+)\)/;
check('band msg, with country suffix',
  BAND.exec('price 1.234 outside band for Diisel in EE (median 1.500, expected 1.200 to 1.800)')?.[2], 'Diisel');
check('band msg, without suffix',
  BAND.exec('price 1.234 outside band for Bensiin 95 (median 1.500, expected 1.200 to 1.800)')?.[2], 'Bensiin 95');
check('bounds msg EUR',
  RANGE.exec('price 17.490 outside allowed range for EUR (expected 0.30 to 4.00)')?.[2], 'EUR');
check('bounds msg SEK',
  RANGE.exec('price 4.990 outside allowed range for SEK (expected 5.00 to 40.00)')?.[2], 'SEK');

console.log('\n── client bounds mirror price_bounds in the DB ──');
console.log('   (if these drift, the client rejects what the server accepts, or vice versa)');
for (const [code, c] of Object.entries(CURRENCIES)) {
  console.log(`   ${code}: ${c.min.toFixed(2)}–${c.max.toFixed(2)}, ${c.decimals}dp, ${c.integerDigits} integer digit(s)`);
}

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
