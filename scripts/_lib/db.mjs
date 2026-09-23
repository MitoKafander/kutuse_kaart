// Service-role Supabase client + the paging every script needs.
//
// PostgREST silently truncates ANY response to 1000 rows, `.limit()` included.
// `stations` crossed that line with the Baltic expansion (1,825 rows), so a
// bare `.select()` now returns a partial table that looks exactly like a
// complete one — the failure that briefly hid 772 stations from the live map.
// Anything reading a table that could grow past 1k goes through fetchAll().

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(repo, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env).');
  process.exit(1);
}

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Read every row of a table, one 1000-row page at a time.
 *
 * Sequential rather than parallel: these are one-off maintenance scripts where
 * correctness beats latency, and sequential pages can't interleave with a
 * concurrent write the way fanned-out ranges can.
 *
 * @param {string} table
 * @param {string} select  column list, default '*'
 * @param {(q:any)=>any} filter  e.g. q => q.eq('active', true)
 */
export async function fetchAll(table, select = '*', filter = (q) => q) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await filter(sb.from(table).select(select))
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

export const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
