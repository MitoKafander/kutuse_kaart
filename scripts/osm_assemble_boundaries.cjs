// Assemble raw Overpass output (admin_level=7 relations + their member ways,
// fetched via the query in rebuild_boundaries.mjs) into a GeoJSON FeatureCollection
// of Estonian municipalities. Shared ways appear once and are referenced by both
// neighbours, so the assembled polygons share IDENTICAL vertices → clean topology
// (no double borders). Each feature carries name / name:et / EHAK / osm_id.
//   node scripts/osm_assemble_boundaries.cjs <overpass_json_in> <geojson_out>
const fs = require('fs');
const IN = process.argv[2] || '/tmp/geofix/osm_final.json';
const OUT = process.argv[3] || '/tmp/geofix/ee_municipalities_current.geojson';
const g = JSON.parse(fs.readFileSync(IN, 'utf8'));

// way id -> [ [lon,lat], ... ]
const wayMap = new Map();
for (const e of g.elements) {
  if (e.type === 'way' && e.geometry) {
    wayMap.set(e.id, e.geometry.map(p => [p.lon, p.lat]));
  }
}
const rels = g.elements.filter(e => e.type === 'relation');

const key = p => p[0] + ',' + p[1];

function stitch(wayIds) {
  let segs = [];
  for (const id of wayIds) {
    const w = wayMap.get(id);
    if (w && w.length >= 2) segs.push(w.slice());
  }
  const rings = [];
  while (segs.length) {
    let ring = segs.shift().slice();
    let guard = 0;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && guard++ < 100000) {
      let matched = false;
      const rEnd = ring[ring.length - 1];
      const rStart = ring[0];
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const s0 = key(s[0]), sN = key(s[s.length - 1]);
        if (s0 === key(rEnd)) { ring = ring.concat(s.slice(1)); segs.splice(i, 1); matched = true; break; }
        if (sN === key(rEnd)) { ring = ring.concat(s.slice(0, -1).reverse()); segs.splice(i, 1); matched = true; break; }
        if (sN === key(rStart)) { ring = s.slice(0, -1).concat(ring); segs.splice(i, 1); matched = true; break; }
        if (s0 === key(rStart)) { ring = s.slice(1).reverse().concat(ring); segs.splice(i, 1); matched = true; break; }
      }
      if (!matched) break; // open ring; push what we have
    }
    rings.push(ring);
  }
  return rings;
}

// ring signed area (shoelace) for orientation + point-in-poly
function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return a / 2;
}
function pointInRing(pt, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function closeRing(r) {
  if (key(r[0]) !== key(r[r.length - 1])) r = r.concat([r[0]]);
  return r;
}

const features = [];
const stats = [];
let openCount = 0;
for (const rel of rels) {
  const outerIds = rel.members.filter(m => m.type === 'way' && (m.role === 'outer' || m.role === '' || m.role == null)).map(m => m.ref);
  const innerIds = rel.members.filter(m => m.type === 'way' && m.role === 'inner').map(m => m.ref);
  let outerRings = stitch(outerIds).filter(r => r.length >= 4);
  let innerRings = stitch(innerIds).filter(r => r.length >= 4);
  // check closure
  const openOuter = outerRings.filter(r => key(r[0]) !== key(r[r.length - 1])).length;
  if (openOuter) openCount += openOuter;
  outerRings = outerRings.map(closeRing);
  innerRings = innerRings.map(closeRing);

  // assign inner rings to containing outer ring
  const polys = outerRings.map(o => [o]); // each polygon = [outer, ...holes]
  for (const inr of innerRings) {
    const testPt = inr[0];
    let placed = false;
    for (let i = 0; i < outerRings.length; i++) {
      if (pointInRing(testPt, outerRings[i])) { polys[i].push(inr); placed = true; break; }
    }
    if (!placed && polys.length) polys[0].push(inr);
  }

  const props = {
    name: rel.tags.name,
    'name:et': rel.tags['name:et'] || rel.tags.name,
    EHAK: rel.tags['EHAK:code'] || null,
    osm_id: rel.id,
    admin_level: 7
  };
  let geometry;
  if (polys.length === 1) geometry = { type: 'Polygon', coordinates: polys[0] };
  else geometry = { type: 'MultiPolygon', coordinates: polys.map(p => p) };
  features.push({ type: 'Feature', properties: props, geometry });
  stats.push({ name: rel.tags.name, outer: outerRings.length, inner: innerRings.length, openOuter });
}

const fc = { type: 'FeatureCollection', features };
fs.writeFileSync(OUT, JSON.stringify(fc));
console.log('WROTE', features.length, 'features. total open outer rings:', openCount);
// report any relation with open rings or many parts
console.log('--- relations with open outer rings (topology risk) ---');
const bad = stats.filter(s => s.openOuter > 0);
console.log(bad.length ? JSON.stringify(bad) : 'NONE');
console.log('--- relations with holes (inner rings) ---');
console.log(stats.filter(s => s.inner > 0).map(s => s.name + '(' + s.inner + ')').join(', '));
console.log('--- multipart (islands) top by outer count ---');
console.log(stats.filter(s => s.outer > 1).sort((a, b) => b.outer - a.outer).slice(0, 12).map(s => s.name + ':' + s.outer).join(', '));
