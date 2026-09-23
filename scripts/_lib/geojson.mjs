// Geometry helpers shared by the boundary builders (Estonia's
// rebuild_boundaries.mjs and the Baltic rebuild_boundaries_baltic.mjs), so
// "what counts as a degenerate ring" has exactly one definition.

import { pointInRing } from './overpass.mjs';

export const round3 = (n) => Math.round(n * 1000) / 1000;

export const ringArea = (r) => {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(a / 2);
};

// A tiny islet can collapse into a zero-area self-retracing sliver during
// simplification (OGC-invalid). The epsilon is far below any real islet
// (~1 ha ≈ 5e-7 deg²), so only truly degenerate rings are removed.
export const RING_EPS = 1e-10;

/**
 * Drop degenerate rings from a geometry.
 *
 * dropAllHoles: a dissolved level-1 region has NO legitimate interior holes —
 * it's a solid area and any enclosed city dissolves into it — so every hole
 * there is a dissolve artifact (a pinhole where member vertices didn't quite
 * coincide). Level-2 units DO have real holes (Rapla vald wraps Rapla linn),
 * so there we only drop degenerate ones.
 */
export function cleanGeom(geom, dropAllHoles = false) {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  const kept = [];
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer || outer.length < 4 || ringArea(outer) < RING_EPS) continue;
    const holes = dropAllHoles ? [] : poly.slice(1).filter((h) => h.length >= 4 && ringArea(h) >= RING_EPS);
    kept.push([outer, ...holes]);
  }
  if (!kept.length) return geom; // never nuke a whole feature (shouldn't happen)
  return kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept };
}

/** Rounds coordinates in place to 3 decimals (~80 m) and returns the bbox. */
export function bboxOf(geom) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      c[0] = round3(c[0]);
      c[1] = round3(c[1]);
      if (c[0] < b[0]) b[0] = c[0];
      if (c[1] < b[1]) b[1] = c[1];
      if (c[0] > b[2]) b[2] = c[0];
      if (c[1] > b[3]) b[3] = c[1];
    } else c.forEach(walk);
  };
  walk(geom.coordinates);
  return b;
}

/**
 * Turn an unordered {outer, inner} ring set into a GeoJSON geometry, putting
 * each hole inside whichever outer ring contains it. Overpass hands back a
 * relation's inner ways with no indication of which outer they belong to, and
 * a hole attached to the wrong polygon renders as a stray cut-out.
 */
export function geometryFromRings(rings) {
  const polys = rings.outer.map((o) => [o]);
  for (const hole of rings.inner) {
    const [hx, hy] = hole[0];
    // Smallest containing outer ring wins — a hole inside a hole-in-an-island
    // belongs to the island, not to the mainland that also contains it.
    let bestIdx = -1;
    let bestArea = Infinity;
    for (let i = 0; i < polys.length; i++) {
      if (!pointInRing(hx, hy, polys[i][0])) continue;
      const a = ringArea(polys[i][0]);
      if (a < bestArea) { bestArea = a; bestIdx = i; }
    }
    if (bestIdx >= 0) polys[bestIdx].push(hole);
  }
  return polys.length === 1
    ? { type: 'Polygon', coordinates: polys[0] }
    : { type: 'MultiPolygon', coordinates: polys };
}
