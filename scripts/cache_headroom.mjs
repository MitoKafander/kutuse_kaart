// Read-only: what `kyts:cache:stations` weighs at the current catalog, in the
// 2-bytes-per-character accounting Safari and Firefox charge against their 5 MiB
// per-origin quota — and how many more stations fit. RUN THIS BEFORE ADDING A
// COUNTRY: a quota failure is silent and takes the celebration store and country
// preferences down with it, so the cache ceiling is the real limit on catalog size.

const KEYS = ['addr:city','addr:district','addr:municipality','addr:place',
              'addr:street','addr:subdistrict','addr:village','alt_name','name','operator'];

const cacheable = (s) => {
  const amenities = {};
  if (s.amenities) for (const k of KEYS) if (s.amenities[k] != null) amenities[k] = s.amenities[k];
  return { id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude,
           country: s.country, parish_id: s.parish_id, active: s.active, amenities };
};

const rows = await fetchAll('stations', 'id, name, latitude, longitude, country, parish_id, active, amenities',
  (q) => q.eq('active', true));
const blob = JSON.stringify(rows.map(cacheable));
const mib = (blob.length * 2) / 1048576;      // 2 bytes/char
const perStation = (blob.length * 2) / rows.length;

console.log(`${rows.length} active stations -> ${mib.toFixed(2)} MiB of a 5 MiB quota (${(100*mib/5).toFixed(0)}%)`);
console.log(`~${perStation.toFixed(0)} bytes per station`);
console.log('');
console.log('Headroom, if a fifth country costs the same per station:');
for (const n of [1000, 2000, 3000, 5000, 7000, 9000]) {
  const t = ((blob.length + (blob.length / rows.length) * n) * 2) / 1048576;
  const flag = t > 5 ? '  ❌ OVER QUOTA' : t > 4 ? '  ⚠️  >80%' : '';
  console.log(`  +${String(n).padStart(5)} stations -> ${t.toFixed(2)} MiB (${(100*t/5).toFixed(0)}%)${flag}`);
}
console.log('');
const headroom = Math.floor((5 * 1048576 / 2 - blob.length) / (blob.length / rows.length));
console.log(`Hard ceiling: ~${headroom} more stations before the station cache alone fills the quota`);
console.log('(and prices, votes, the celebration store and country prefs share it)');
