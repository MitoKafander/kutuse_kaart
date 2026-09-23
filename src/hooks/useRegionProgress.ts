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
  | { kind: 'station';  stationId: string; stationName: string; done: number; total: number }
  // Completing every station of one chain. The audit found this is the
  // strongest collecting loop Kyts has and the only one with no celebration —
  // and it is the loop LV/LT users are left with, since their regions hold
  // roughly twice as many stations as Estonia's.
  | { kind: 'brand';    brand: string; total: number }
  // Crossing 25/50/75% of a region. Region completion almost never fires (only
  // 22% of Estonian contributors have ever finished a vald in five years), so
  // a 13-station Latvian novads gave no feedback at all until the thirteenth
  // visit. These are the rungs on the way up.
  | {
      kind: 'milestone';
      id: number;
      name: string;
      /** The rung that was crossed — drives the emoji tier and the store key. */
      pct: 25 | 50 | 75;
      /**
       * The user's ACTUAL percentage, which is what the toast shows. Crossing
       * the 25% rung at 4 of 13 stations is 31%, and a headline reading "25%"
       * above a subtitle reading "4/13" contradicts itself.
       */
      actualPct: number;
      done: number;
      total: number;
    };

/**
 * Per-country, because region ids only mean anything inside their own country
 * and the progress snapshot this store is diffed against is country-scoped.
 * With one shared store, the first switch to another country diffed that
 * country's completions against a store seeded from the previous one and
 * replayed every already-earned region as fresh fireworks.
 */
const celebratedKey = (country: string) => `kyts-celebrated-regions:${country}`;

type CelebratedStore = { parishes: number[]; maakonnad: number[]; stations: string[]; brands: string[]; milestones: string[] };

function readCelebrated(country: string): CelebratedStore {
  try {
    const raw = localStorage.getItem(celebratedKey(country));
    if (!raw) return { parishes: [], maakonnad: [], stations: [], brands: [], milestones: [] };
    const parsed = JSON.parse(raw);
    return {
      parishes: Array.isArray(parsed?.parishes) ? parsed.parishes : [],
      maakonnad: Array.isArray(parsed?.maakonnad) ? parsed.maakonnad : [],
      stations: Array.isArray(parsed?.stations) ? parsed.stations : [],
      // Absent in stores written before brand/milestone events existed.
      brands: Array.isArray(parsed?.brands) ? parsed.brands : [],
      milestones: Array.isArray(parsed?.milestones) ? parsed.milestones : [],
    };
  } catch {
    return { parishes: [], maakonnad: [], stations: [], brands: [], milestones: [] };
  }
}

function writeCelebrated(country: string, store: CelebratedStore) {
  try { localStorage.setItem(celebratedKey(country), JSON.stringify(store)); } catch { /* quota */ }
}

/**
 * Every "<parishId>:<pct>" rung a region has already passed.
 *
 * Thresholds are crossed, never un-crossed: a region at 60% has passed both 25
 * and 50, so a user who jumps straight from 0 to 60% gets both rungs rather
 * than silently skipping one. 100% is deliberately absent — that is the parish
 * completion event, which already exists.
 */
const MILESTONE_RUNGS = [25, 50, 75] as const;

function passedMilestones(progress: RegionProgress): string[] {
  const out: string[] = [];
  for (const pm of progress.perMaakond) {
    for (const p of pm.parishes) {
      if (p.stationsTotal <= 0 || p.stationsDone <= 0) continue;
      // A COMPLETED region banks all three rungs rather than being skipped.
      // Skipping meant its rungs were never marked seen, so the moment the
      // catalog grew — a new station seeded into a finished vald — it dropped
      // below 100% and replayed 25/50/75 as if they were new.
      const pct = p.stationsDone >= p.stationsTotal
        ? 100
        : (p.stationsDone / p.stationsTotal) * 100;
      for (const rung of MILESTONE_RUNGS) if (pct >= rung) out.push(`${p.parish.id}:${rung}`);
    }
  }
  return out;
}

/** Highest rung in a "<id>:<rung>" key. */
const rungOf = (key: string) => Number(key.split(':')[1]);

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
  // Gates MILESTONES only. Completions, station discoveries and brand wins all
  // fire independently — they're tied to the act of submitting a price, not to
  // the map-view mode. Milestones are the one kind that only makes sense once
  // you've opened the map ("31% of Ogres novads" means nothing otherwise).
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
  // Per-brand collecting progress for the active country, so a completed
  // chain can fire its own celebration. Same shape ProfileDrawer renders.
  brandProgress: Array<{ brand: string; done: number; total: number }>;
  // Which country `maakonnad`/`parishes` describe. Changing it re-seeds
  // silently against that country's own store, so switching to Latvia does
  // not replay Latvia's already-complete novadi as new.
  country: string;
}): { progress: RegionProgress; events: CelebrationEvent[]; consumeEvents: () => void } {
  const { contributedStationIds, maakonnad, parishes, stationParishMap, stationNamesMap, emitCelebrations, contributionsReady, userId, country, brandProgress } = opts;

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
  // In-memory mirrors of the celebrated store, checked BEFORE the store in
  // every diff loop. They are what makes a failed localStorage write cost at
  // most the current session instead of replaying every earned win on every
  // refresh, forever — writeCelebrated swallows quota errors by design.
  const lastParishesRef = useRef<Set<number>>(new Set());
  const lastMaakonnadRef = useRef<Set<number>>(new Set());
  const lastStationsRef = useRef<Set<string>>(new Set());
  const lastBrandsRef = useRef<Set<string>>(new Set());
  const lastMilestonesRef = useRef<Set<string>>(new Set());
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
      lastBrandsRef.current = new Set();
      lastMilestonesRef.current = new Set();
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
      // Same anti-retroactive rule as regions: a chain already finished, or a
      // milestone already passed, is banked silently on first observation so a
      // long-time contributor doesn't get a burst of fireworks for old work.
      const seedBrands = new Set([
        ...store.brands,
        ...brandProgress.filter(b => b.total >= 2 && b.done >= b.total).map(b => b.brand),
      ]);
      const seedMilestones = new Set([...store.milestones, ...passedMilestones(progress)]);
      writeCelebrated(country, {
        parishes: Array.from(seedParishes),
        maakonnad: Array.from(seedMaakonnad),
        stations: Array.from(seedStations),
        brands: Array.from(seedBrands),
        milestones: Array.from(seedMilestones),
      });
      lastParishesRef.current = new Set(progress.completedParishIds);
      lastMaakonnadRef.current = new Set(progress.completedMaakondIds);
      lastStationsRef.current = new Set(contributedStationIds);
      lastBrandsRef.current = new Set(seedBrands);
      lastMilestonesRef.current = new Set(seedMilestones);
      seededRef.current = true;
      seededForRef.current = seedIdentity;
      return;
    }

    const store = readCelebrated(country);
    const celebratedParishes = new Set(store.parishes);
    const celebratedMaakonnad = new Set(store.maakonnad);
    const celebratedStations = new Set(store.stations);
    const celebratedBrands = new Set(store.brands);
    const celebratedMilestones = new Set(store.milestones);

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
      // NOT gated on the Avastuskaart toggle. Completing a region is an
      // achievement earned by submitting prices, not by looking at a map, and
      // the toggle is off by default for every new user — so gating it meant
      // the rarest reward in the app was destroyed for most of the people who
      // earned it (only 22% of Estonian contributors have ever completed a
      // vald at all). It is also rare enough to never be spam. Milestones
      // below stay gated: those are progress pings, and the progress itself
      // is still there in the badge grid whenever the user opens it.
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
      celebratedMaakonnad.add(mid); // ungated, see the parish loop above
      newEvents.push({
        kind: 'maakond', id: mid, name: m.name, emoji: m.emoji || '🏆',
      });
    }

    // Brand completions fire regardless of the Avastuskaart toggle, like
    // station discoveries: they are tied to the act of submitting a price,
    // not to the map-view mode. That matters most for LV/LT, where the map
    // toggle is off by default and the region loop is the slow one.
    for (const b of brandProgress) {
      // A one-station "chain" is not a chain — getBrand() falls back to the
      // raw station name for anything CHAIN_PATTERNS doesn't match, so 120 of
      // the 122 single-member brands are just independent forecourts. Firing
      // "chain completed" on top of "station discovered" for the same single
      // price is noise, not a reward.
      if (b.total < 2 || b.done < b.total) continue;
      if (lastBrandsRef.current.has(b.brand)) continue;
      if (celebratedBrands.has(b.brand)) continue;
      celebratedBrands.add(b.brand);
      newEvents.push({ kind: 'brand', brand: b.brand, total: b.total });
    }

    // Region milestones follow the region rules: gated on the toggle, since a
    // user who hasn't opened the Avastuskaart has no context for "half of
    // Ogres novads".
    if (emitCelebrations) {
      // Bank every new rung, but toast only the HIGHEST one per region in this
      // pass. A 2-station vald crosses 25% and 50% on the same price (12 of
      // Estonia's 78 vallad have exactly 2), and a 0->77% jump crosses all
      // three — one reward per action, not three.
      const freshByRegion = new globalThis.Map<number, string>();
      for (const key of passedMilestones(progress)) {
        if (lastMilestonesRef.current.has(key)) continue;
        if (celebratedMilestones.has(key)) continue;
        celebratedMilestones.add(key);
        const id = Number(key.split(':')[0]);
        const best = freshByRegion.get(id);
        if (!best || rungOf(key) > rungOf(best)) freshByRegion.set(id, key);
      }
      for (const [id, key] of freshByRegion) {
        const entry = progress.perMaakond
          .flatMap(pm => pm.parishes)
          .find(x => x.parish.id === id);
        if (!entry) continue;
        // A region that is already complete gets no milestone — the parish
        // completion event owns that moment. Its rungs are still banked above.
        if (entry.stationsDone >= entry.stationsTotal) continue;
        newEvents.push({
          kind: 'milestone',
          id,
          name: entry.parish.name,
          pct: rungOf(key) as 25 | 50 | 75,
          actualPct: Math.round((entry.stationsDone / entry.stationsTotal) * 100),
          done: entry.stationsDone,
          total: entry.stationsTotal,
        });
      }
    }

    const storeDirty =
      newEvents.length ||
      celebratedParishes.size !== store.parishes.length ||
      celebratedMaakonnad.size !== store.maakonnad.length ||
      celebratedStations.size !== store.stations.length ||
      celebratedBrands.size !== store.brands.length ||
      celebratedMilestones.size !== store.milestones.length;
    if (storeDirty) {
      writeCelebrated(country, {
        parishes: Array.from(celebratedParishes),
        maakonnad: Array.from(celebratedMaakonnad),
        stations: Array.from(celebratedStations),
        brands: Array.from(celebratedBrands),
        milestones: Array.from(celebratedMilestones),
      });
    }
    lastParishesRef.current = new Set(progress.completedParishIds);
    lastMaakonnadRef.current = new Set(progress.completedMaakondIds);
    lastStationsRef.current = new Set(contributedStationIds);
    // Re-set from CURRENT TRUTH, not from `celebratedBrands`/`celebratedMilestones`.
    // Those are rebuilt from the store on every pass, so when a write has failed
    // they come back empty — and since the refs above correctly suppressed the
    // emission, nothing would have been added to them either. Assigning them
    // back would wipe the very shield that just worked, and the next pass would
    // replay everything. The three older kinds re-set from progress/
    // contributedStationIds for exactly this reason.
    lastBrandsRef.current = new Set(
      brandProgress.filter(b => b.total >= 2 && b.done >= b.total).map(b => b.brand),
    );
    lastMilestonesRef.current = new Set(passedMilestones(progress));
    // Celebration events are produced from progress diffs; consumeEvents() drains them, so newEvents will be [] next pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newEvents.length) setEvents(prev => [...prev, ...newEvents]);
  }, [progress, maakonnad, contributedStationIds, stationNamesMap, emitCelebrations, contributionsReady, userId, country, brandProgress]);

  const consumeEvents = () => setEvents([]);
  return { progress, events, consumeEvents };
}
