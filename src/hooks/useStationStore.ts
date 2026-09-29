import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { fetchAllRows } from '../utils/fetchAllRows';
import { toCountryCode, type CountryCode } from '../constants/countries';

// The station catalogue the client holds.
//
// WHY THIS EXISTS. Until 2026-09-29 every page load fetched every active
// station in every country: 19 requests and 8.8 MB of JSON for 18,787 rows,
// on each open and again after every price submission — while the map draws
// one country. An Estonian driver downloaded Poland to look at 482 stations.
// Germany (14,000+ stations) would have doubled it.
//
// So the store holds:
//   - the ACTIVE country in full (loadCountry) — the map, search, Avastuskaart
//     and statistics all read only that;
//   - plus whatever cross-border slices a feature has actually asked for:
//       loadNear   stations of ANY country around a position: price entry
//                  (0.5–1 km), scan currency and first-run country (3 km),
//                  Cheapest nearby (up to 20 km). At Valga the right answer
//                  is often a pump in Valka.
//       loadBox    an explicit box — the route planner's route.
//       loadIds    specific stations — favourites and your own price history,
//                  which can be in any country.
//
// The Map is the source of truth and is mutated synchronously, so a caller
// that awaits a load reads the rows it asked for without waiting a render.
// `stations` is the snapshot React renders from.

export type Box = { s: number; w: number; n: number; e: number };

/**
 * Radius every "near me" consumer can rely on. Cheapest nearby's widest
 * option is 20 km; price entry needs 1 km; the scan-currency and first-run
 * country checks need 3 km.
 */
const NEAR_NEED_KM = 20;
/**
 * Radius actually fetched. The 10 km of slack means driving around town
 * does not refetch: a new request happens only once the 20 km circle leaves
 * every box already loaded.
 */
const NEAR_FETCH_KM = 30;

export function boxAround(lat: number, lon: number, km: number): Box {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { s: lat - dLat, n: lat + dLat, w: lon - dLon, e: lon + dLon };
}
const contains = (o: Box, i: Box) => o.s <= i.s && o.n >= i.n && o.w <= i.w && o.e >= i.e;
const inBox = (b: Box, s: any) =>
  s.latitude >= b.s && s.latitude <= b.n && s.longitude >= b.w && s.longitude <= b.e;

export function useStationStore(
  initial: () => any[],
  /** Called after a country's full catalogue lands (the first-paint cache hooks in here). */
  onCountryLoaded?: (cc: CountryCode, rows: any[]) => void,
) {
  // The store itself: one Map for the component's lifetime, created once from
  // the first-paint cache. Held in state only for its stable identity — it is
  // mutated in place and never passed to a setter.
  const [store] = useState(() => new globalThis.Map<string, any>(initial().map((s) => [String(s.id), s])));
  const [stations, setStations] = useState<any[]>(() => Array.from(store.values()));
  // Countries whose FULL catalogue is loaded. State, not just a ref: a
  // consumer must be able to wait for it — the celebration seeding in
  // useRegionProgress would otherwise bank "nothing completed" for a country
  // whose stations have not arrived yet, then fire every old completion as
  // new the moment they do.
  const [loadedCountries, setLoadedCountries] = useState<ReadonlySet<CountryCode>>(() => new Set());

  const onLoadedRef = useRef(onCountryLoaded);
  useEffect(() => { onLoadedRef.current = onCountryLoaded; });

  const publish = useCallback(() => setStations(Array.from(store.values())), [store]);

  const loadedRef = useRef(new Set<CountryCode>());
  const countryInflight = useRef(new globalThis.Map<CountryCode, Promise<boolean>>());

  /** The full catalogue of one country. `force` refetches one already loaded. */
  const loadCountry = useCallback((cc: CountryCode, force = false): Promise<boolean> => {
    if (!force && loadedRef.current.has(cc)) return Promise.resolve(true);
    const inflight = countryInflight.current.get(cc);
    if (inflight) return inflight;
    const p = (async () => {
      // Ordered by id so the parallel pages are a stable partition.
      const { data } = await fetchAllRows('stations', (q) =>
        q.eq('active', true).eq('country', cc).order('id', { ascending: true }));
      if (!data) return false;
      // REPLACE the country's slice rather than merge into it: a station
      // deactivated since the last load has to leave the map.
      for (const [id, s] of store) if (toCountryCode(s.country) === cc) store.delete(id);
      for (const r of data) store.set(String(r.id), r);
      publish();
      if (!loadedRef.current.has(cc)) {
        loadedRef.current.add(cc);
        setLoadedCountries(new Set(loadedRef.current));
      }
      onLoadedRef.current?.(cc, data);
      return true;
    })().finally(() => countryInflight.current.delete(cc));
    countryInflight.current.set(cc, p);
    return p;
  }, [publish, store]);

  const boxesRef = useRef<Box[]>([]);
  const boxInflight = useRef(new globalThis.Map<string, Promise<void>>());
  const rowsIn = useCallback((b: Box) => Array.from(store.values()).filter((s) => inBox(b, s)), [store]);

  /**
   * Every active station, any country, inside `fetchBox` — skipped when some
   * earlier box already covers `needBox`. Resolves once the rows are in the
   * store; a failed fetch resolves too (the caller works with what is there,
   * exactly as before this store existed when the one big fetch failed).
   */
  const ensureBox = useCallback((fetchBox: Box, needBox: Box = fetchBox): Promise<void> => {
    if (boxesRef.current.some((b) => contains(b, needBox))) return Promise.resolve();
    const key = [fetchBox.s, fetchBox.w, fetchBox.n, fetchBox.e].map((v) => v.toFixed(3)).join(',');
    const inflight = boxInflight.current.get(key);
    if (inflight) return inflight;
    const p = (async () => {
      const { data } = await fetchAllRows('stations', (q) => q.eq('active', true)
        .gte('latitude', fetchBox.s).lte('latitude', fetchBox.n)
        .gte('longitude', fetchBox.w).lte('longitude', fetchBox.e)
        .order('id', { ascending: true }));
      if (!data) return;
      for (const r of data) store.set(String(r.id), r);
      boxesRef.current.push(fetchBox);
      publish();
    })().finally(() => boxInflight.current.delete(key));
    boxInflight.current.set(key, p);
    return p;
  }, [publish, store]);

  /** Make sure stations around a position are loaded. Fire-and-forget friendly. */
  const ensureNear = useCallback((lat: number, lon: number) =>
    ensureBox(boxAround(lat, lon, NEAR_FETCH_KM), boxAround(lat, lon, NEAR_NEED_KM)), [ensureBox]);

  /** Load stations around a position and return them (any country). */
  const loadNear = useCallback(async (lat: number, lon: number): Promise<any[]> => {
    await ensureNear(lat, lon);
    return rowsIn(boxAround(lat, lon, NEAR_NEED_KM));
  }, [ensureNear, rowsIn]);

  const idsTried = useRef(new Set<string>());
  /**
   * Specific stations by id. Ids asked for once are not asked for again: a
   * favourite whose station has since been deactivated would otherwise be
   * re-requested on every render that passes it.
   */
  const loadIds = useCallback(async (ids: Iterable<unknown>): Promise<void> => {
    const missing = Array.from(new Set(Array.from(ids, String)))
      .filter((id) => id && id !== 'null' && id !== 'undefined' && !store.has(id) && !idsTried.current.has(id));
    if (!missing.length) return;
    for (const id of missing) idsTried.current.add(id);
    let added = false;
    // Chunked: an `in` list of a few hundred uuids is a long URL.
    for (let i = 0; i < missing.length; i += 150) {
      const { data } = await supabase.from('stations').select('*').in('id', missing.slice(i, i + 150)).eq('active', true);
      for (const r of data ?? []) { store.set(String(r.id), r); added = true; }
    }
    if (added) publish();
  }, [publish, store]);

  return { stations, loadedCountries, loadCountry, ensureNear, loadNear, ensureBox, loadIds };
}
