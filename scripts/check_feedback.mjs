// Read-only: dumps the two Kyts feedback channels.
//  1) v_open_feedback         — general in-app feedback (resolved_at IS NULL)
//  2) v_station_report_counts — per-station complaints (no resolved_at col)
// Run from project root: `node scripts/check_feedback.mjs`
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '..', '.env') });

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const sb = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('=== CHANNEL 1: v_open_feedback (general, open only) ===');
{
  const { data, error } = await sb.from('v_open_feedback').select('*');
  if (error) console.error('ERR:', error.message);
  else if (!data.length) console.log('(none open)');
  else console.log(JSON.stringify(data, null, 2));
}

console.log('\n=== CHANNEL 2: v_station_report_counts (per-station) ===');
{
  const { data, error } = await sb
    .from('v_station_report_counts')
    .select('*')
    .order('report_count', { ascending: false });
  if (error) console.error('ERR:', error.message);
  else if (!data.length) console.log('(none)');
  else console.log(JSON.stringify(data, null, 2));
}

console.log('\n=== Raw recent station_reports (last 40, with station name) ===');
{
  const { data, error } = await sb
    .from('station_reports')
    .select('id, station_id, kind, note, user_id, created_at, stations(name, active)')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) console.error('ERR:', error.message);
  else if (!data.length) console.log('(none)');
  else console.log(JSON.stringify(data, null, 2));
}
