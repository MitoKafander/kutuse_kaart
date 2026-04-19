// Read-only diagnostic — replays the phase 37 earning rule in JS against
// every price submission in the last 30 days. Prints total rows, how many
// would NOT have earned a point under the new rule, and the top offenders.
//
// Run from project root: `node scripts/diagnose_point_spam.js`

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sb = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const WINDOW_DAYS = 30;
const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

// Page through prices — Supabase defaults to 1000-row ceilings.
const all = [];
const step = 1000;
let from = 0;
while (true) {
  const { data, error } = await sb
    .from('prices')
    .select('id, user_id, station_id, fuel_type, price, reported_at')
    .not('user_id', 'is', null)
    .gte('reported_at', since)
    .order('reported_at', { ascending: true })
    .range(from, from + step - 1);
  if (error) { console.error(error); process.exit(1); }
  all.push(...data);
  if (data.length < step) break;
  from += step;
}

console.log(`Fetched ${all.length} price rows from the last ${WINDOW_DAYS} days (user_id NOT NULL).`);

// Group by (user, station, fuel).
const groups = new Map();
for (const r of all) {
  const k = `${r.user_id}|${r.station_id}|${r.fuel_type}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

let totalRows = 0;
let nonEarning = 0;
const perUser = new Map();
const ruleAHits = new Map(); // user -> count (same-price-within-1h)
const ruleBHits = new Map(); // user -> count (cap-exceeded)

for (const rows of groups.values()) {
  rows.sort((a, b) => a.reported_at.localeCompare(b.reported_at));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tMs = Date.parse(r.reported_at);
    const priorHr = [];
    for (let j = i - 1; j >= 0; j--) {
      const dt = tMs - Date.parse(rows[j].reported_at);
      if (dt > 3600_000) break;
      if (dt > 0) priorHr.push(rows[j]);
    }
    const priceAlreadySeen = priorHr.some(p => p.price === r.price);
    const distinctPrior = new Set(priorHr.map(p => p.price)).size;
    const earns = !priceAlreadySeen && distinctPrior < 2;
    totalRows++;
    if (!earns) {
      nonEarning++;
      perUser.set(r.user_id, (perUser.get(r.user_id) || 0) + 1);
      if (priceAlreadySeen) ruleAHits.set(r.user_id, (ruleAHits.get(r.user_id) || 0) + 1);
      else                  ruleBHits.set(r.user_id, (ruleBHits.get(r.user_id) || 0) + 1);
    }
  }
}

const pct = (n) => ((100 * n) / totalRows).toFixed(1);

console.log(`\n=== Summary ===`);
console.log(`Total rows:       ${totalRows}`);
console.log(`Earning rows:     ${totalRows - nonEarning} (${pct(totalRows - nonEarning)}%)`);
console.log(`Non-earning rows: ${nonEarning} (${pct(nonEarning)}%)`);

if (nonEarning === 0) {
  console.log(`\nNo spam detected in the last ${WINDOW_DAYS} days. Leaderboard scores should be stable after the migration.`);
  process.exit(0);
}

console.log(`\n=== Top non-earning submitters (would-be lost points) ===`);
const sorted = [...perUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [user, count] of sorted) {
  const a = ruleAHits.get(user) || 0;
  const b = ruleBHits.get(user) || 0;
  console.log(`  ${user.slice(0, 8)}…  ${String(count).padStart(4)} non-earning  (rule-a dup-price: ${a}, rule-b cap: ${b})`);
}
