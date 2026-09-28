// Deactivate stations whose NAME says they are closed — the retroactive half of
// the rule the seeder now applies on import (scripts/_lib/stations.mjs).
//
//   node scripts/deactivate_closed_named_stations.mjs          list only
//   node scripts/deactivate_closed_named_stations.mjs --write  deactivate
//
// Deactivates, never deletes: the phase-64 trigger recounts parishes.station_count
// on an `active` change, and a wrongly matched station is one UPDATE away from
// coming back. Prices, if any, stay attached.

import { sb, fetchAll } from './_lib/db.mjs';
import { CLOSED_NAME_RE } from './_lib/stations.mjs';

const write = process.argv.includes('--write');
const rows = await fetchAll('stations', 'id, name, country', (q) => q.eq('active', true));
const hits = rows.filter((r) => CLOSED_NAME_RE.test(r.name ?? ''));

for (const r of hits) console.log(`  ${r.country}  ${r.name}`);
console.log(`\n${hits.length} active station(s) named as closed.`);
if (!hits.length || !write) {
  if (hits.length) console.log('Dry run — pass --write to deactivate.');
  process.exit(0);
}

const { error } = await sb.from('stations').update({ active: false }).in('id', hits.map((r) => r.id));
if (error) throw error;
console.log(`Deactivated ${hits.length}.`);
