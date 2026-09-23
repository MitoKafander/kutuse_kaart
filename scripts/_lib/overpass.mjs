// Shared Overpass client for the Baltic seeds (phase 65).
//
// Why this exists: the one-off `fetch(OVERPASS_URL)` calls in the older seed
// scripts silently accept a mirror that answers 200 with `{elements: []}` —
// which the public mirrors do under load, and which looks exactly like "this
// country has no municipalities". A seed that believes that would wipe a
// region catalog. So every query here declares what it expects and the client
// keeps rotating mirrors until a response satisfies it.
//
// Responses are cached on disk (.osm-cache/, gitignored) because these are
// 10-100 MB queries that take minutes; reruns of the seeds must be cheap.

import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO = join(here, '..', '..');
export const CACHE_DIR = join(REPO, '.osm-cache');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Overpass asks for a contactable UA; anonymous floods get throttled first.
const HEADERS = {
  'User-Agent': 'kyts.ee Baltic station seed (kyts@mikkrosin.ee)',
  'Content-Type': 'application/x-www-form-urlencoded',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run an Overpass query, rotating mirrors until `expect(json)` returns true.
 *
 * @param {string} query      Overpass QL.
 * @param {object} opts
 * @param {string} opts.cacheKey   File name under .osm-cache (required).
 * @param {(j:any)=>boolean} opts.expect  Sanity predicate. A 200 that fails it
 *                                 is treated as a mirror failure, not as data.
 * @param {number} [opts.maxAgeH]  Reuse a cached file younger than this.
 * @param {boolean} [opts.force]   Ignore the cache.
 */
export async function overpass(query, { cacheKey, expect, maxAgeH = 72, force = false }) {
  if (!cacheKey) throw new Error('cacheKey is required');
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, cacheKey);

  if (!force && existsSync(cachePath)) {
    const ageH = (Date.now() - statSync(cachePath).mtimeMs) / 3.6e6;
    if (ageH < maxAgeH) {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (expect(cached)) {
        console.log(`  [cache] ${cacheKey} (${ageH.toFixed(1)}h old, ${cached.elements?.length ?? 0} elements)`);
        return cached;
      }
      console.log(`  [cache] ${cacheKey} failed its sanity check — refetching`);
    }
  }

  const failures = [];
  // Two full passes over the mirrors: a mirror that is merely busy right now
  // often answers on the second lap, and rotating beats hammering one host.
  for (let attempt = 0; attempt < ENDPOINTS.length * 2; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    const label = `${url.split('/')[2]} (attempt ${attempt + 1})`;
    try {
      process.stdout.write(`  [fetch] ${label}… `);
      const started = Date.now();
      const res = await fetch(url, { method: 'POST', headers: HEADERS, body: 'data=' + encodeURIComponent(query) });
      if (!res.ok) {
        console.log(`HTTP ${res.status}`);
        failures.push(`${label}: HTTP ${res.status}`);
        await sleep(res.status === 429 ? 30_000 : 5_000);
        continue;
      }
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        console.log('non-JSON body');
        failures.push(`${label}: non-JSON (${text.slice(0, 80)})`);
        await sleep(5_000);
        continue;
      }
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      if (json.remark) {
        console.log(`remark: ${json.remark}`);
        failures.push(`${label}: ${json.remark}`);
        await sleep(10_000);
        continue;
      }
      if (!expect(json)) {
        console.log(`sanity check failed (${json.elements?.length ?? 0} elements, ${secs}s)`);
        failures.push(`${label}: sanity check failed (${json.elements?.length ?? 0} elements)`);
        await sleep(10_000);
        continue;
      }
      console.log(`ok (${json.elements.length} elements, ${secs}s)`);
      writeFileSync(cachePath, JSON.stringify(json));
      return json;
    } catch (e) {
      console.log(`error: ${e.message}`);
      failures.push(`${label}: ${e.message}`);
      await sleep(5_000);
    }
  }
  throw new Error(`Overpass failed for ${cacheKey}:\n  ${failures.join('\n  ')}`);
}

/**
 * Stitch a relation's member ways into closed rings.
 *
 * Overpass `out geom` hands back an unordered bag of ways; multipolygon
 * boundaries only become polygons once you walk them end-to-end. Ways whose
 * endpoints don't meet exactly are joined by nearest-endpoint within EPS,
 * which is what OSM boundary data needs in practice (shared nodes are exact;
 * the tolerance only absorbs the occasional float round-trip).
 */
export function ringsFromRelation(rel, { eps = 1e-7 } = {}) {
  const ways = (rel.members || [])
    .filter((m) => m.type === 'way' && m.role !== 'inner' && Array.isArray(m.geometry) && m.geometry.length > 1)
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  const inner = (rel.members || [])
    .filter((m) => m.type === 'way' && m.role === 'inner' && Array.isArray(m.geometry) && m.geometry.length > 1)
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]));

  const close = (segments) => {
    const rings = [];
    const pool = segments.slice();
    while (pool.length) {
      let ring = pool.shift().slice();
      let extended = true;
      while (extended && !isClosed(ring, eps)) {
        extended = false;
        for (let i = 0; i < pool.length; i++) {
          const w = pool[i];
          const tail = ring[ring.length - 1];
          const head = ring[0];
          if (near(tail, w[0], eps))            { ring = ring.concat(w.slice(1)); pool.splice(i, 1); extended = true; break; }
          if (near(tail, w[w.length - 1], eps)) { ring = ring.concat(w.slice().reverse().slice(1)); pool.splice(i, 1); extended = true; break; }
          if (near(head, w[w.length - 1], eps)) { ring = w.slice(0, -1).concat(ring); pool.splice(i, 1); extended = true; break; }
          if (near(head, w[0], eps))            { ring = w.slice().reverse().slice(0, -1).concat(ring); pool.splice(i, 1); extended = true; break; }
        }
      }
      if (ring.length >= 4) {
        if (!isClosed(ring, eps)) ring.push(ring[0]); // force-close a tiny gap
        rings.push(ring);
      }
    }
    return rings;
  };

  return { outer: close(ways), inner: close(inner) };
}

const near = (a, b, eps) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
const isClosed = (r, eps) => r.length > 3 && near(r[0], r[r.length - 1], eps);

/** Ray-casting point-in-ring. Ring is [[lon,lat], …]. */
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Point in a {outer, inner} ring set: inside any outer, outside every hole. */
export function pointInRings(lon, lat, rings) {
  if (!rings.outer.some((r) => pointInRing(lon, lat, r))) return false;
  return !rings.inner.some((r) => pointInRing(lon, lat, r));
}

export function bboxOfRings(rings) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings.outer) {
    for (const [x, y] of r) {
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  }
  return b;
}

/** Cheap area-weighted centroid of a ring set's outer rings. */
export function centroidOfRings(rings) {
  let bestArea = -1;
  let best = null;
  for (const r of rings.outer) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length - 1; i++) {
      const cross = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
      a += cross;
      cx += (r[i][0] + r[i + 1][0]) * cross;
      cy += (r[i][1] + r[i + 1][1]) * cross;
    }
    a /= 2;
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a);
      best = a === 0 ? r[0] : [cx / (6 * a), cy / (6 * a)];
    }
  }
  return best;
}
