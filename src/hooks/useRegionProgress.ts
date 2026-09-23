import { useEffect, useMemo, useRef, useState } from 'react';

// `country` arrived with phase 65. It's optional because a client can be
// running against a DB where the migration hasn't been applied yet — absent
// means Estonia, which is what every pre-phase-65 row was.
export type Maakond = { id: number; name: string; emoji: string | null; station_count: number; country?: string | null };
export type Parish = { id: number; maakond_id: number; name: string; station_count: number; country?: string | null };

export type RegionProgress = {
  stations: { done: number; total: number };
  parishes: { done: number; total: number };
  maakonnad: { done: number; total: number };
  // Per-maakond drilldown for the badge grid.
  perMaakond: Array<{
    maakond: Maakond;
    parishesDone: number;
    parishesTotal: number;
    stationsDone: number;
    stationsTotal: number;
    parishes: Array<{ parish: Parish; stationsDone: number; stationsTotal: number }>;
  }>;
  completedParishIds: Set<number>;
  completedMaakondIds: Set<number>;
};

export type CelebrationEvent =
  | { kind: 'parish';   id: number; name: string; maakondName: string; emoji: string }
  | { kind: 'maakond';  id: number; name: string; emoji: string }
  | { kind: 'station';  stationId: string; stationName: string; done: number; total: number };

/**
 * Per-country, because region ids only mean anything inside their own country
 * and the progress snapshot this store is diffed against is country-scoped.
 * With one shared store, the first switch to another country diffed that
 * country's completions against a store seeded from the previous one and
 * replayed every already-earned region as fresh fireworks.
 */
const celebratedKey = (country: string) => `kyts-celebrated-regions:${country}`;

type CelebratedStore = { parishes: number[]; maakonnad: number[]; stations: string[] };

function readCelebrated(country: string): CelebratedStore {
  try {
    const raw = localStorage.getItem(celebratedKey(country));
    if (!raw) return { parishes: [], maakonnad: [], stations: [] };
    const parsed = JSON.parse(raw);
    return {
      parishes: Array.isArray(parsed?.parishes) ? parsed.parishes : [],
      maakonnad: Array.isArray(parsed?.maakonnad) ? parsed.maakonnad : [],
      stations: Array.isArray(parsed?.stations) ? parsed.stations : [],
    };
  } catch {
    return { parishes: [], maakonnad: [], stations: [] };
  }
}

function writeCelebrated(country: string, store: CelebratedStore) {
  try { localStorage.setItem(celebratedKey(country), JSON.stringify(store)); } catch { /* quota */ }
}

// Given a user's contributed station ids + the region catalog, compute
// counters, per-maakond drilldown, and a queue of celebration events for
// regions that transitioned from <100% to 100% since last render. On the
// FIRST observation (component mount / post-login hydrate) we seed the
// "already celebrated" store with everything currently complete so
// long-time contributors don't get retroactive fireworks — only newly
// completed regions going forward fire.
export function useRegionProgress(opts: {
  contributedStationIds: Set<string>;
  maakonnad: Maakond[];
  parishes: Parish[];
  // station -> parish mapping, for every country (a station without a
  // parish_id — e.g. one seeded outside any mapped municipality — is simply
  // absent and can't contribute to region progress).
  stationParishMap: Map<string, number>;
  // station -> display name, used for station-discovery toast copy.
  stationNamesMap: Map<string, string>;
  // Gate parish/maakond celebrations on the Avastuskaart toggle being live.
  // Station-discovery toasts fire independently — they're tied to the act of
  // submitting a price, not to the map-view mode.
  emitCelebrations: boolean;
  // True once `contributedStationIds` reflects the actual current-user
  // contributions. For anonymous users this is always true (empty set is
  // the truth); for signed-in users the parent flips it to true only after
  // the initial prices fetch completes — otherwise we'd seed with an empty
  // set and then fire a "new station discovered" toast for every station
  // the user had already contributed once prices arrive.
  contributionsReady: boolean;
  // Current session user id (or null if anonymous). When it changes we
  // re-seed so a fresh sign-in / sign-out doesn't mis-diff against the
  // previous session's snapshot.
  userId: string | null;
  // Which country `maakonnad`/`parishes` describe. Changing it re-seeds
  // silently against that country's own store, so switching to Latvia does
  // not replay Latvia's already-complete novadi as new.
  country: string;
}): { progress: RegionProgress; events: CelebrationEvent[]; consumeEvents: () => void } {
  const { contributedStationIds, maakonnad, parishes, stationParishMap, stationNamesMap, emitCelebrations, contributionsReady, userId, country } = opts;

  const progress = useMemo<RegionProgress>(() => {
    // Sort the level-1 regions alphabetically for a stable grid order. The
    // 'et' collation orders ÕÄÖÜ correctly and leaves Latvian/Lithuanian
    // diacritics in a sane place; the catalog is single-country anyway.
    const sortedMaakonnad = [...maakonnad].sort((a, b) => a.name.localeCompare(b.name, 'et'));
    const parishesByMaakond = new Map<number, Parish[]>();
    for (const p of parishes) {
      const list = parishesByMaakond.get(p.maakond_id) || [];
      list.push(p);
      parishesByMaakond.set(p.maakond_id, list);
    }

    // Count contributed stations per parish.
    const contributedPerParish = new Map<number, number>();
    let stationsDoneTotal = 0;
    let stationsTotal = 0;
    for (const sid of contributedStationIds) {
      const parishId = stationParishMap.get(sid);
      if (parishId == null) continue;
      contributedPerParish.set(parishId, (contributedPerParish.get(parishId) || 0) + 1);
    }

    const completedParishIds = new Set<number>();
    const completedMaakondIds = new Set<number>();
    const perMaakond: RegionProgress['perMaakond'] = [];

    let parishesDoneTotal = 0;
    let parishesTotalCounter = 0;

    for (const m of sortedMaakonnad) {
      const mParishes = (parishesByMaakond.get(m.id) || []).filter(p => p.station_count > 0);
      let mParishesDone = 0;
      let mStationsDone = 0;
      let mStationsTotal = 0;
      const parishList: RegionProgress['perMaakond'][number]['parishes'] = [];

      for (const p of mParishes) {
        const done = contributedPerParish.get(p.id) || 0;
        mStationsDone += Math.min(done, p.station_count);
        mStationsTotal += p.station_count;
        parishList.push({ parish: p, stationsDone: Math.min(done, p.station_count), stationsTotal: p.station_count });
        if (done >= p.station_count) {
          completedParishIds.add(p.id);
          mParishesDone += 1;
          parishesDoneTotal += 1;
        }
        parishesTotalCounter += 1;
      }

      const mkDone = mParishes.length > 0 && mParishesDone >= mParishes.length;
      if (mkDone) completedMaakondIds.add(m.id);

      stationsDoneTotal += mStationsDone;
      stationsTotal += mStationsTotal;

      parishList.sort((a, b) => a.parish.name.localeCompare(b.parish.name, 'et'));
      perMaakond.push({
        maakond: m,
        parishesDone: mParishesDone,
        parishesTotal: mParishes.length,
        stationsDone: mStationsDone,
        stationsTotal: mStationsTotal,
        parishes: parishList,
      });
    }

    // Only count maakonnad that actually contain parishes-with-stations in the
    // denominator — an empty maakond can't be completed.
    const maakonnadTotal = perMaakond.filter(x => x.parishesTotal > 0).length;
    const maakonnadDone = completedMaakondIds.size;

    return {
      stations:  { done: stationsDoneTotal, total: stationsTotal },
      parishes:  { done: parishesDoneTotal, total: parishesTotalCounter },
      maakonnad: { done: maakonnadDone, total: maakonnadTotal },
      perMaakond,
      completedParishIds,
      completedMaakondIds,
    };
  }, [contributedStationIds, maakonnad, parishes, stationParishMap]);

  const seededRef = useRef(false);
  const seededForRef = useRef<string | undefined>(undefined);
  const lastParishesRef = useRef<Set<number>>(new Set());
  const lastMaakonnadRef = useRef<Set<number>>(new Set());
  const lastStationsRef = useRef<Set<string>>(new Set());
  const [events, setEvents] = useState<CelebrationEvent[]>([]);

  useEffect(() => {
    // Identity change (sign-in, sign-out, account switch) invalidates the
    // previous snapshot — reset so the next effect run re-seeds against
    // the new user's contributions.
    // Identity OR country change invalidates the snapshot.
    const seedIdentity = `${userId ?? 'anon'}@${country}`;
    if (seededForRef.current !== seedIdentity) {
      seededRef.current = false;
      lastParishesRef.current = new Set();
      lastMaakonnadRef.current = new Set();
      lastStationsRef.current = new Set();
    }

    // First run after we have real data: seed the "already celebrated" store
    // with whatever is currently complete/contributed, so toggle-ON (for
    // regions) or first launch (for stations) is silent for existing
    // contributors. Do nothing if regions haven't loaded yet.
    if (!seededRef.current) {
      if (progress.maakonnad.total === 0) return; // wait for region catalog
      if (!contributionsReady) return; // wait for prices fetch to complete
      const store = readCelebrated(country);
      const seedParishes = new Set([...store.parishes, ...progress.completedParishIds]);
      const seedMaakonnad = new Set([...store.maakonnad, ...progress.completedMaakondIds]);
      const seedStations = new Set([...store.stations, ...contributedStationIds]);
      writeCelebrated(country, {
        parishes: Array.from(seedParishes),
        maakonnad: Array.from(seedMaakonnad),
        stations: Array.from(seedStations),
      });
      lastParishesRef.current = new Set(progress.completedParishIds);
      lastMaakonnadRef.current = new Set(progress.completedMaakondIds);
      lastStationsRef.current = new Set(contributedStationIds);
      seededRef.current = true;
      seededForRef.current = seedIdentity;
      return;
    }

    const store = readCelebrated(country);
    const celebratedParishes = new Set(store.parishes);
    const celebratedMaakonnad = new Set(store.maakonnad);
    const celebratedStations = new Set(store.stations);

    const newEvents: CelebrationEvent[] = [];
    const maakondById = new Map(maakonnad.map(m => [m.id, m]));

    // Station discoveries fire first so their toast queues ahead of any
    // region-completion toast triggered by the same submission.
    for (const sid of contributedStationIds) {
      if (lastStationsRef.current.has(sid)) continue;
      if (celebratedStations.has(sid)) continue;
      celebratedStations.add(sid);
      const name = stationNamesMap.get(sid) || 'Uus jaam';
      newEvents.push({
        kind: 'station',
        stationId: sid,
        stationName: name,
        // progress.stations.done, NOT contributedStationIds.size: the latter
        // counts every station the user has ever priced in ANY country, while
        // total is this country's catalog. A Latvian who had also priced in
        // Estonia could see "31/14 stations collected".
        done: progress.stations.done,
        total: progress.stations.total,
      });
    }

    for (const pid of progress.completedParishIds) {
      if (lastParishesRef.current.has(pid)) continue;
      if (celebratedParishes.has(pid)) continue;
      const entry = progress.perMaakond.find(pm => pm.parishes.some(x => x.parish.id === pid));
      if (!entry) continue;
      const parish = entry.parishes.find(x => x.parish.id === pid)!.parish;
      // Only bank it as celebrated when we actually celebrate it. This used to
      // run unconditionally, so a region completed while the Avastuskaart
      // toggle was off — its default state for every new user — was marked
      // seen and could never fire again. The reward was silently consumed by
      // the act of earning it at the wrong moment.
      if (!emitCelebrations) continue;
      celebratedParishes.add(pid);
      newEvents.push({
        kind: 'parish', id: pid, name: parish.name,
        maakondName: entry.maakond.name,
        emoji: entry.maakond.emoji || '📍',
      });
    }

    for (const mid of progress.completedMaakondIds) {
      if (lastMaakonnadRef.current.has(mid)) continue;
      if (celebratedMaakonnad.has(mid)) continue;
      const m = maakondById.get(mid);
      if (!m) continue;
      if (!emitCelebrations) continue; // see the parish loop above
      celebratedMaakonnad.add(mid);
      newEvents.push({
        kind: 'maakond', id: mid, name: m.name, emoji: m.emoji || '🏆',
      });
    }

    const storeDirty =
      newEvents.length ||
      celebratedParishes.size !== store.parishes.length ||
      celebratedMaakonnad.size !== store.maakonnad.length ||
      celebratedStations.size !== store.stations.length;
    if (storeDirty) {
      writeCelebrated(country, {
        parishes: Array.from(celebratedParishes),
        maakonnad: Array.from(celebratedMaakonnad),
        stations: Array.from(celebratedStations),
      });
    }
    lastParishesRef.current = new Set(progress.completedParishIds);
    lastMaakonnadRef.current = new Set(progress.completedMaakondIds);
    lastStationsRef.current = new Set(contributedStationIds);
    // Celebration events are produced from progress diffs; consumeEvents() drains them, so newEvents will be [] next pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newEvents.length) setEvents(prev => [...prev, ...newEvents]);
  }, [progress, maakonnad, contributedStationIds, stationNamesMap, emitCelebrations, contributionsReady, userId, country]);

  const consumeEvents = () => setEvents([]);
  return { progress, events, consumeEvents };
}
