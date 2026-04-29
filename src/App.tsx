import { useEffect, useState, useMemo, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Map } from './components/Map';
import { Search, UserCircle, Camera, Euro, Navigation, TrendingUp, X, Fuel, Compass } from 'lucide-react';
import { capture } from './utils/analytics';
import { GdprBanner } from './components/GdprBanner';
import { BrandPickerPill } from './components/BrandPickerPill';
import { CelebrationOverlay } from './components/CelebrationOverlay';
import { PointsToast, type PointsEvent } from './components/PointsToast';
import { DiscoveryBanner } from './components/DiscoveryBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { FeedbackReplyToast } from './components/FeedbackReplyToast';
import { type MarketInsight } from './components/MarketInsightDrawer';
import { useRegionProgress, type Maakond, type Parish } from './hooks/useRegionProgress';
import i18n, { SUPPORTED_LANGUAGES } from './i18n';

// Lazy-load every panel, drawer, and modal that sits behind an open-flag.
// The map is the LCP element and must stay eager; these are all hidden on
// first paint, so deferring their JS shaves ~200+ kB off the initial bundle.
// In particular, StationDrawer ships recharts (~60 kB gz) and ProfileDrawer
// is 1,400+ lines on its own.
//
// lazyWithReload: after a fresh deploy, old tabs hold an index.js that
// references chunk hashes (e.g. StatisticsDrawer-D9lfdbbC.js) no longer on
// the server. Clicking a lazy-loaded panel then throws "Failed to fetch
// dynamically imported module". Instead of greeting the user with an error
// boundary, reload once so they get the new index.
function lazyWithReload<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try { return await factory(); }
    catch (err: any) {
      const msg = String(err?.message || '');
      if (/Failed to fetch dynamically imported module|Importing a module script failed|is not a valid JavaScript MIME type/i.test(msg)
          && !sessionStorage.getItem('kyts:chunk-reloaded')) {
        sessionStorage.setItem('kyts:chunk-reloaded', '1');
        window.location.reload();
        return new Promise<never>(() => {}); // block render until reload kicks in
      }
      throw err;
    }
  });
}

const AuthModal = lazyWithReload(() => import('./components/AuthModal').then(m => ({ default: m.AuthModal })));
const StationDrawer = lazyWithReload(() => import('./components/StationDrawer').then(m => ({ default: m.StationDrawer })));
const ManualPriceModal = lazyWithReload(() => import('./components/ManualPriceModal').then(m => ({ default: m.ManualPriceModal })));
const ProfileDrawer = lazyWithReload(() => import('./components/ProfileDrawer').then(m => ({ default: m.ProfileDrawer })));
const CheapestNearbyPanel = lazyWithReload(() => import('./components/CheapestNearbyPanel').then(m => ({ default: m.CheapestNearbyPanel })));
const PrivacyModal = lazyWithReload(() => import('./components/PrivacyModal').then(m => ({ default: m.PrivacyModal })));
const TermsModal = lazyWithReload(() => import('./components/TermsModal').then(m => ({ default: m.TermsModal })));
const FeedbackModal = lazyWithReload(() => import('./components/FeedbackModal').then(m => ({ default: m.FeedbackModal })));
const StationReportModal = lazyWithReload(() => import('./components/StationReportModal').then(m => ({ default: m.StationReportModal })));
const TutorialModal = lazyWithReload(() => import('./components/TutorialModal').then(m => ({ default: m.TutorialModal })));
const InstallPromptModal = lazyWithReload(() => import('./components/InstallPromptModal').then(m => ({ default: m.InstallPromptModal })));
const LeaderboardDrawer = lazyWithReload(() => import('./components/LeaderboardDrawer').then(m => ({ default: m.LeaderboardDrawer })));
const RoutePlanModal = lazyWithReload(() => import('./components/RoutePlanModal').then(m => ({ default: m.RoutePlanModal })));
const StatisticsDrawer = lazyWithReload(() => import('./components/StatisticsDrawer').then(m => ({ default: m.StatisticsDrawer })));
import { supabase } from './supabase';
import { getStationDisplayName, getBrand } from './utils';
import type { LoyaltyDiscounts, BrandProgress } from './utils';
import { shouldAutoShowInstallPrompt } from './utils/install';
import './index.css';

const FUEL_TYPES = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];

// Page a Supabase select past PostgREST's `db-max-rows` cap. The Supabase
// platform silently truncates any single response to 1000 rows regardless of
// `.limit()` — which previously dropped older `prices` rows from the client and
// made Avastuskaart "lose" completed valds the moment the table grew past 1k.
// Strategy: the first page asks for `count: 'exact'` so the rest can fan out in
// parallel without a separate HEAD round-trip, and short-circuits if the table
// fits in one page. Order is preserved across pages by the caller-supplied
// `apply` callback (must be a stable, non-volatile expression for pagination
// to be deterministic). Hard cap protects against runaway loops if `count`
// somehow disagrees with reality.
async function fetchAllRows<T = any>(
  table: string,
  apply: (q: any) => any = (q) => q,
): Promise<{ data: T[] | null; error: any }> {
  const PAGE = 1000;
  const SAFETY_CAP = 100_000;
  const first = await apply(supabase.from(table).select('*', { count: 'exact' })).range(0, PAGE - 1);
  if (first.error) return { data: null, error: first.error };
  const head = (first.data ?? []) as T[];
  const total = Math.min(first.count ?? head.length, SAFETY_CAP);
  if (head.length < PAGE || head.length >= total) return { data: head, error: null };
  const requests: Promise<any>[] = [];
  for (let from = PAGE; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    requests.push(apply(supabase.from(table).select('*')).range(from, to));
  }
  const rest = await Promise.all(requests);
  // Dedupe by id: parallel pages can both observe the same row when a write
  // lands between requests (a new row at offset 0 shifts existing rows down,
  // so the last row of page N reappears as the first row of page N+1).
  const seen = new Set<any>();
  const all: T[] = [];
  for (const row of head) {
    const id = (row as any)?.id;
    if (id != null && seen.has(id)) continue;
    if (id != null) seen.add(id);
    all.push(row);
  }
  for (const r of rest) {
    if (r.error) return { data: null, error: r.error };
    for (const row of (r.data ?? []) as T[]) {
      const id = (row as any)?.id;
      if (id != null && seen.has(id)) continue;
      if (id != null) seen.add(id);
      all.push(row);
    }
  }
  return { data: all, error: null };
}

function App() {
  const { t } = useTranslation();
  const [session, setSession] = useState<any>(null);
  
  // Modals state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  // Photo + context restored from sessionStorage after an auto-reload-retry.
  // When set, ManualPriceModal skips the file picker and immediately re-runs
  // the AI scan on the existing image.
  const [pendingScanRestore, setPendingScanRestore] = useState<{
    base64: string;
    stationId: string | null;
    capturedPosition: { lat: number; lon: number } | null;
    pendingDetectedBrand: string | null;
  } | null>(null);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isCheapestNearbyOpen, setIsCheapestNearbyOpen] = useState(false);
  const [nearbyRadius, setNearbyRadius] = useState(20);
  const [isRouteOpen, setIsRouteOpen] = useState(false);
  const [routeMounted, setRouteMounted] = useState(false);
  const [liveUserLocation, setLiveUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [routePolyline, setRoutePolyline] = useState<[number, number][] | null>(null);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isStationReportOpen, setIsStationReportOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isInstallPromptOpen, setIsInstallPromptOpen] = useState(false);
  const [marketInsightSeenId, setMarketInsightSeenId] = useState<string | null>(
    () => localStorage.getItem('kyts:market-insight-seen')
  );

  // Data state. Stations seed from a localStorage SWR cache so the first
  // React commit can paint dots immediately — loadData still runs in the
  // background and overwrites with fresh data. Prices intentionally stay
  // out of the cache: the table is paged in via fetchAllRows and can run to
  // many MB of JSON; the parse cost on cold mount outweighs the
  // perceived-perf win, and the dots themselves are the "we're alive" signal.
  const [stations, setStations] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem('kyts:cache:stations');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [prices, setPrices] = useState<any[]>([]);
  const [pricesLoaded, setPricesLoaded] = useState(false);
  // Increments on every loadData success so child components (currently
  // FeedbackReplyToast) can hook a refetch onto the same SWR cycle without
  // needing direct access to App's data fetches.
  const [loadDataCounter, setLoadDataCounter] = useState(0);
  const [votes, setVotes] = useState<any[]>([]);
  const [reporterMap, setReporterMap] = useState<Record<string, string>>({});
  const [activeInsight, setActiveInsight] = useState<MarketInsight | null>(null);
  const [pointsEvents, setPointsEvents] = useState<PointsEvent[]>([]);
  
  // User specialized state (Phase 8)
  const [favorites, setFavorites] = useState<any[]>([]);
  const [defaultFuelType, setDefaultFuelType] = useState<string | null>(null);
  const [preferredBrands, setPreferredBrands] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState<string>('');
  
  // Filter state
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedFuelType, setSelectedFuelType] = useState<string | null>(null);
  const [showOnlyFresh, setShowOnlyFresh] = useState(false);
  const [highlightCheapest, setHighlightCheapest] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const hasActiveFilters = showOnlyFresh || highlightCheapest || selectedBrands.length > 0;

  // Theme + display preferences
  const [mapStyle, setMapStyle] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('kyts-map-style') as 'dark' | 'light' | null;
    if (saved === 'dark' || saved === 'light') return saved;
    return typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  });
  const [dotStyle, setDotStyle] = useState<'info' | 'brand'>(() => {
    return (localStorage.getItem('kyts-dot-style') as 'info' | 'brand') || 'info';
  });
  const [showClusters, setShowClusters] = useState(() => {
    return localStorage.getItem('kyts-show-clusters') !== 'false';
  });
  const [hideEmptyDots, setHideEmptyDots] = useState(() => {
    return localStorage.getItem('kyts-hide-empty-dots') === 'true';
  });
  const [showLatvianStations, setShowLatvianStations] = useState(() => {
    return localStorage.getItem('kyts-show-latvian-stations') !== 'false';
  });
  const [showStaleDemo, setShowStaleDemo] = useState(() => {
    return localStorage.getItem('kyts-show-stale-demo') === 'true';
  });
  const [loyaltyDiscounts, setLoyaltyDiscounts] = useState<LoyaltyDiscounts>(() => {
    try { return JSON.parse(localStorage.getItem('kyts-loyalty-discounts') || '{}'); }
    catch { return {}; }
  });
  const [applyLoyalty, setApplyLoyalty] = useState(() => {
    return localStorage.getItem('kyts-apply-loyalty') !== 'false';
  });
  const [showDiscoveryMap, setShowDiscoveryMap] = useState(() => {
    return localStorage.getItem('kyts-show-discovery-map') === 'true';
  });
  const [sharePublicly, setSharePublicly] = useState(false);
  const [shareReporterName, setShareReporterName] = useState(true);
  // When a row on the Avastajad leaderboard is clicked, the map enters a
  // "viewing someone else's footprint" mode. Personal toggle state is
  // preserved — exiting the view restores it.
  const [viewedUser, setViewedUser] = useState<{ id: string; name: string; stationIds: Set<string> } | null>(null);
  // Region catalog — loaded once, cached locally so toggle-ON is instant.
  const [maakonnad, setMaakonnad] = useState<Maakond[]>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('kyts-regions-v1') || 'null');
      return Array.isArray(cached?.maakonnad) ? cached.maakonnad : [];
    } catch { return []; }
  });
  const [parishes, setParishes] = useState<Parish[]>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('kyts-regions-v1') || 'null');
      return Array.isArray(cached?.parishes) ? cached.parishes : [];
    } catch { return []; }
  });
  // Avastuskaart focus: when set, the map dims everything outside this
  // maakond and flies to its bounds. Cleared by banner "X" or toggle-off.
  const [focusedMaakondId, setFocusedMaakondId] = useState<number | null>(null);
  // Increment to signal "open Avastuskaart section" to the profile drawer —
  // used by the DiscoveryBanner tap and when a tile in the stats grid is
  // clicked while the map mode was already on (no-op then, but cheap).
  const [avastuskaartFocusTrigger, setAvastuskaartFocusTrigger] = useState(0);
  // Lazy-loaded on first toggle-ON; cached in the bundle hash so repeat
  // toggles are instant without a refetch.
  const [maakondGeo, setMaakondGeo] = useState<any | null>(null);
  const [parishGeo, setParishGeo] = useState<any | null>(null);
  const maakondGeoFetchRef = useRef(false);
  const parishGeoFetchRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mapStyle);
  }, [mapStyle]);

  // Auto-reload-and-retry recovery: if the previous tab life stashed an
  // in-flight scan before reloading (ManualPriceModal "AI_UPSTREAM_BUSY"
  // escape hatch), re-open the camera modal with the photo + context so
  // the user sees the scan resume instead of starting over.
  useEffect(() => {
    const pending = sessionStorage.getItem('kyts:pending-scan');
    if (!pending) return;
    sessionStorage.removeItem('kyts:pending-scan');
    try {
      const parsed = JSON.parse(pending);
      if (parsed?.base64) {
        setPendingScanRestore(parsed);
        setIsCameraOpen(true);
      }
    } catch {
      sessionStorage.removeItem('kyts:scan-reload-attempted');
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem('kyts-map-style')) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => setMapStyle(e.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // First-run tutorial: show once after the GDPR banner is dismissed (either
  // accept or decline — the tutorial itself is feature guidance, not
  // analytics-gated). For returning users who already made a consent decision
  // in a previous session, this fires on mount. For first-visit users,
  // GdprBanner.onAccept/onDecline triggers it so the two overlays don't
  // stack. The 400 ms delay lets the GDPR banner's slide-out animation finish
  // first.
  const tutorialArmedRef = useRef(false);
  const openTutorialAfterGdpr = () => {
    if (tutorialArmedRef.current) return;
    if (localStorage.getItem('kyts:tutorial-seen')) return;
    tutorialArmedRef.current = true;
    setTimeout(() => setIsTutorialOpen(true), 400);
  };
  useEffect(() => {
    // Accept both the new consent key and the legacy one so returning users
    // who clicked Accept before the reject-button rollout still skip the
    // banner + receive the tutorial on first post-consent load.
    if (
      localStorage.getItem('gdpr_consent') === 'accepted' ||
      localStorage.getItem('gdpr_accepted') === 'true'
    ) {
      openTutorialAfterGdpr();
    }
  }, []);

  // Back button closes the topmost overlay instead of leaving the app.
  // LIFO stack keyed by overlay id: newly-opened overlays are pushed; popstate
  // always closes the most recently opened one. Previous implementation used a
  // count + hard-coded priority chain, which picked the wrong overlay to close
  // whenever the user's open order didn't match that priority.
  const overlayStackRef = useRef<Array<{ id: string; close: () => void; skipRewind?: boolean }>>([]);
  const suppressPopRef = useRef(0);
  // Timestamp of the last successful loadData() call; used by the
  // visibility-change refresher to decide whether the cached data is stale
  // enough to warrant a refetch when the tab regains focus.
  const lastLoadedAtRef = useRef(0);

  const openOverlays = useMemo(() => {
    const list: Array<{ id: string; close: () => void; skipRewind?: boolean }> = [];
    if (isPriceModalOpen) list.push({ id: 'priceModal', close: () => setIsPriceModalOpen(false) });
    if (isPhotoExpanded) list.push({ id: 'photoZoom', close: () => setIsPhotoExpanded(false) });
    if (isCameraOpen) list.push({ id: 'camera', close: () => setIsCameraOpen(false) });
    if (isManualOpen) list.push({ id: 'manual', close: () => setIsManualOpen(false) });
    if (isAuthOpen) list.push({ id: 'auth', close: () => setIsAuthOpen(false) });
    // Privacy / Terms intentionally skipped: the legal modals can be opened
    // from the GDPR banner (which lives outside this registry), so tying them
    // into the history stack produced a rewind-overshoot that walked the tab
    // off kyts.ee. Close flows are the X button, backdrop click, and the
    // "sulge" button — no back-gesture support, which is fine for a leaf doc.
    if (isFeedbackOpen) list.push({ id: 'feedback', close: () => setIsFeedbackOpen(false) });
    if (isStationReportOpen) list.push({ id: 'stationReport', close: () => setIsStationReportOpen(false) });
    // Tutorial is marked skipRewind: on first visit it's the first overlay
    // ever pushed, and rewinding one step on Valmis can navigate off-site
    // when the user reached kyts.ee via a real navigation (not a direct
    // tab). We keep the pushState (so Android back still closes it), but
    // accept one leaked history entry on programmatic close instead.
    if (isTutorialOpen) list.push({ id: 'tutorial', close: () => setIsTutorialOpen(false), skipRewind: true });
    if (isProfileOpen) list.push({ id: 'profile', close: () => setIsProfileOpen(false) });
    if (selectedStation) list.push({ id: 'station', close: () => setSelectedStation(null) });
    if (isCheapestNearbyOpen) list.push({ id: 'cheapestNearby', close: () => setIsCheapestNearbyOpen(false) });
    return list;
  }, [isPriceModalOpen, isPhotoExpanded, isCameraOpen, isManualOpen, isAuthOpen, isFeedbackOpen, isStationReportOpen, isTutorialOpen, isProfileOpen, selectedStation, isCheapestNearbyOpen]);

  useEffect(() => {
    const stack = overlayStackRef.current;
    const openIds = new Set(openOverlays.map(o => o.id));
    // 1. Drop any stack entries that are no longer open (programmatic close).
    //    Each rewindable removal costs one history entry we must rewind,
    //    suppressing our own popstate handler for that tick so we don't
    //    re-close something. Entries flagged skipRewind leave a stale
    //    history entry behind on purpose (see tutorial comment above).
    const removed = stack.filter(e => !openIds.has(e.id));
    if (removed.length) {
      overlayStackRef.current = stack.filter(e => openIds.has(e.id));
      const rewindCount = removed.filter(e => !e.skipRewind).length;
      if (rewindCount > 0) {
        suppressPopRef.current += rewindCount;
        window.history.go(-rewindCount);
      }
    }
    // 2. Append newly-opened overlays in open order + push history per entry.
    const known = new Set(overlayStackRef.current.map(e => e.id));
    for (const o of openOverlays) {
      if (!known.has(o.id)) {
        overlayStackRef.current.push(o);
        window.history.pushState({ overlay: o.id }, '');
      } else {
        // Refresh the close callback so it uses the latest setter identity.
        const i = overlayStackRef.current.findIndex(e => e.id === o.id);
        if (i >= 0) overlayStackRef.current[i] = o;
      }
    }
  }, [openOverlays]);

  useEffect(() => {
    const handlePopState = () => {
      if (suppressPopRef.current > 0) {
        suppressPopRef.current -= 1;
        return;
      }
      const top = overlayStackRef.current.pop();
      if (top) top.close();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // If user unselects fuel type, automatically turn off cheapest highlight
  useEffect(() => {
    if (!selectedFuelType) setHighlightCheapest(false);
  }, [selectedFuelType]);

  const handlePricesSubmitted = (pointsEarned?: number) => {
    loadData();
    if (pointsEarned && pointsEarned > 0) {
      setPointsEvents(q => [...q, { id: Date.now() + Math.random(), amount: pointsEarned }]);
    }
  };

  // Load Base Data & User Data
  const loadData = async (activeSession?: any) => {
    // Fan out the public queries in parallel. They're independent, land on
    // the same HTTP/2 connection, and previously ran serially — PSI showed the
    // 4th finishing at 2.4s on Slow 4G when the 1st finished at 1.6s.
    const [stRes, prRes, vtRes, repsRes, insightRes] = await Promise.all([
      supabase.from('stations').select('*').eq('active', true),
      fetchAllRows('prices', q => q.order('reported_at', { ascending: false }).order('id', { ascending: false })),
      fetchAllRows('votes', q => q.order('created_at', { ascending: false }).order('id', { ascending: false })),
      supabase.from('v_reporters').select('user_id, display_name'),
      supabase.from('market_insights').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (stRes.data) {
      setStations(stRes.data);
      try { localStorage.setItem('kyts:cache:stations', JSON.stringify(stRes.data)); }
      catch { /* quota exceeded — non-fatal, next load will retry */ }
    }
    if (prRes.data) setPrices(prRes.data);
    setPricesLoaded(true);
    if (vtRes.data) setVotes(vtRes.data);
    if (insightRes?.data) setActiveInsight(insightRes.data);
    lastLoadedAtRef.current = Date.now();
    setLoadDataCounter(c => c + 1);

    // Reporter display-name map for price attribution (phase 36 view).
    if (repsRes.data) {
      const map: Record<string, string> = {};
      repsRes.data.forEach((r: any) => { if (r.user_id && r.display_name) map[r.user_id] = r.display_name; });
      setReporterMap(map);
    }

    const currentUser = activeSession || session;
    if (currentUser?.user) {
      // Same fan-out for the signed-in user's three preference tables.
      const [favsRes, loyaltyRes, profRes] = await Promise.all([
        supabase.from('user_favorites').select('*'),
        supabase.from('user_loyalty_discounts').select('brand, discount_cents'),
        supabase.from('user_profiles').select('default_fuel_type, preferred_brands, dot_style, show_clusters, hide_empty_dots, show_latvian_stations, apply_loyalty, display_name, show_discovery_map, share_discovery_publicly, share_reporter_name, language, theme').eq('id', currentUser.user.id).single(),
      ]);

      if (favsRes.data) setFavorites(favsRes.data);

      if (loyaltyRes.data) {
        const map: LoyaltyDiscounts = {};
        loyaltyRes.data.forEach((r: any) => { map[r.brand] = Number(r.discount_cents); });
        setLoyaltyDiscounts(map);
        localStorage.setItem('kyts-loyalty-discounts', JSON.stringify(map));
      }

      const prof = profRes.data;
      if (prof?.display_name) setDisplayName(prof.display_name);
      if (prof?.default_fuel_type) {
        setDefaultFuelType(prof.default_fuel_type);
        // Automatically set map filter on first load
        setSelectedFuelType(prev => prev || prof.default_fuel_type);
      }
      if (prof?.preferred_brands) {
        setPreferredBrands(prof.preferred_brands);
      }
      if (prof?.dot_style) {
        setDotStyle(prof.dot_style);
        localStorage.setItem('kyts-dot-style', prof.dot_style);
      }
      if (prof?.show_clusters !== null && prof?.show_clusters !== undefined) {
        setShowClusters(prof.show_clusters);
        localStorage.setItem('kyts-show-clusters', String(prof.show_clusters));
      }
      if (prof?.hide_empty_dots !== null && prof?.hide_empty_dots !== undefined) {
        setHideEmptyDots(prof.hide_empty_dots);
        localStorage.setItem('kyts-hide-empty-dots', String(prof.hide_empty_dots));
      }
      if (prof?.show_latvian_stations !== null && prof?.show_latvian_stations !== undefined) {
        setShowLatvianStations(prof.show_latvian_stations);
        localStorage.setItem('kyts-show-latvian-stations', String(prof.show_latvian_stations));
      }
      if (prof?.apply_loyalty !== null && prof?.apply_loyalty !== undefined) {
        setApplyLoyalty(prof.apply_loyalty);
        localStorage.setItem('kyts-apply-loyalty', String(prof.apply_loyalty));
      }
      if (prof?.show_discovery_map !== null && prof?.show_discovery_map !== undefined) {
        setShowDiscoveryMap(prof.show_discovery_map);
        localStorage.setItem('kyts-show-discovery-map', String(prof.show_discovery_map));
      }
      if (prof?.share_discovery_publicly !== null && prof?.share_discovery_publicly !== undefined) {
        setSharePublicly(prof.share_discovery_publicly);
      }
      if (prof?.share_reporter_name !== null && prof?.share_reporter_name !== undefined) {
        setShareReporterName(prof.share_reporter_name);
      }
      if (prof?.language && (SUPPORTED_LANGUAGES as readonly string[]).includes(prof.language)) {
        if (i18n.language !== prof.language) i18n.changeLanguage(prof.language);
        localStorage.setItem('kyts-language', prof.language);
      }
      if (prof?.theme === 'dark' || prof?.theme === 'light') {
        setMapStyle(prof.theme);
        localStorage.setItem('kyts-map-style', prof.theme);
      }
    } else {
      // Signed-out state: every preference that's synced from user_profiles
      // must be reverted to its anonymous default AND its localStorage cache
      // cleared — otherwise a user who previously toggled "hide empty dots"
      // while logged in would keep seeing the hidden state as a guest on the
      // next visit (issue #2).
      setFavorites([]);
      setDefaultFuelType(null);
      setPreferredBrands([]);
      setDisplayName('');
      setHideEmptyDots(false);
      setShowClusters(true);
      setShowLatvianStations(true);
      setDotStyle('info');
      setApplyLoyalty(true);
      setLoyaltyDiscounts({});
      setShowDiscoveryMap(false);
      setSharePublicly(false);
      setShareReporterName(true);
      setViewedUser(null);
      localStorage.removeItem('kyts-hide-empty-dots');
      localStorage.removeItem('kyts-show-clusters');
      localStorage.removeItem('kyts-show-latvian-stations');
      localStorage.removeItem('kyts-dot-style');
      localStorage.removeItem('kyts-apply-loyalty');
      localStorage.removeItem('kyts-loyalty-discounts');
      localStorage.removeItem('kyts-show-discovery-map');
      localStorage.removeItem('kyts-celebrated-regions');
      localStorage.removeItem('kyts-language');
    }
  };

  useEffect(() => {
    // onAuthStateChange fires an INITIAL_SESSION event the moment we subscribe,
    // delivering the current session (or null). Relying on that instead of a
    // separate getSession() call halves boot work — previously both paths ran
    // loadData() and PSI's network tree showed every query hitting Supabase
    // twice (~100 kB of duplicate transfer on Slow 4G, seen 2026-04-19).
    let bootLoaded = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setPricesLoaded(false);
      // De-dupe: INITIAL_SESSION arrives on subscribe and then again on nothing,
      // plus a TOKEN_REFRESHED can fire on the same tab right after sign-in.
      // We only want one public-data load per tab boot; auth mutations force a
      // reload through their explicit handlers (onPricesSubmitted, toggleFav).
      if (!bootLoaded) {
        bootLoaded = true;
        loadData(session);
      } else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        loadData(session);
      }

      // Mobile post-OAuth viewport fix: when Google redirects back to the app
      // on Android Chrome, the visible viewport height and `100dvh` briefly
      // disagree, pushing absolutely-positioned FABs off-screen until the
      // next layout pass. Nudging resize re-syncs CSS dvh units + Leaflet.
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const nudge = () => window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(nudge);
        setTimeout(nudge, 150);
        setTimeout(nudge, 600);
      }
    });

    // Drive app height from JS. In standalone PWA mode on Android, `100dvh`
    // can stay stale after returning from an OAuth redirect, so we set a
    // --app-height CSS var from visualViewport/innerHeight and keep it in sync.
    const vv = window.visualViewport;
    const setAppHeight = () => {
      const h = vv?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    };
    setAppHeight();
    vv?.addEventListener('resize', setAppHeight);
    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    window.addEventListener('pageshow', setAppHeight);

    return () => {
      subscription.unsubscribe();
      vv?.removeEventListener('resize', setAppHeight);
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
      window.removeEventListener('pageshow', setAppHeight);
    };
  }, []);

  // Refetch public data when the tab returns to the foreground after being
  // stale for >5 min. Without this, a tab opened in the morning keeps
  // yesterday's prices visible all day unless the user force-reloads.
  useEffect(() => {
    const STALE_MS = 5 * 60 * 1000;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadedAtRef.current < STALE_MS) return;
      loadData(session);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [session]);

  // Load region catalog (maakonnad + parishes) once; cache locally so Avastuskaart
  // can render instantly on toggle-ON. Background-refresh from Supabase to keep
  // station_count denormalization current.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: mk }, { data: pa }] = await Promise.all([
        supabase.from('maakonnad').select('id, name, emoji, station_count'),
        supabase.from('parishes').select('id, maakond_id, name, station_count'),
      ]);
      if (cancelled) return;
      if (mk) setMaakonnad(mk as Maakond[]);
      if (pa) setParishes(pa as Parish[]);
      try {
        localStorage.setItem('kyts-regions-v1', JSON.stringify({ maakonnad: mk, parishes: pa }));
      } catch { /* quota */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Clear focus when discovery mode is turned off — otherwise a stale
  // focused-maakond state would filter stations silently the next time
  // the user flipped the toggle back on.
  useEffect(() => {
    if (!showDiscoveryMap) setFocusedMaakondId(null);
  }, [showDiscoveryMap]);

  // Fetch maakond boundary geojson once, the first time discovery mode is
  // enabled. Static asset from public/ — browser caches it aggressively.
  useEffect(() => {
    if (!showDiscoveryMap || maakondGeoFetchRef.current) return;
    maakondGeoFetchRef.current = true;
    fetch('/maakonnad.geojson')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setMaakondGeo(data); })
      .catch(() => { /* non-critical */ });
  }, [showDiscoveryMap]);

  // Parish outlines are bigger (~150 KB gzipped) than maakonnad so we fetch
  // them separately and the map layer hides them until zoom ≥ 9 regardless.
  useEffect(() => {
    if (!showDiscoveryMap || parishGeoFetchRef.current) return;
    parishGeoFetchRef.current = true;
    fetch('/parishes.geojson')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setParishGeo(data); })
      .catch(() => { /* non-critical */ });
  }, [showDiscoveryMap]);

  // station.id -> parish.id, only for EE stations with a parish_id.
  // `Map` is shadowed by the Map component import — use globalThis.Map.
  const stationParishMap = useMemo(() => {
    const m = new globalThis.Map<string, number>();
    for (const s of stations) {
      if (s.parish_id != null) m.set(String(s.id), s.parish_id);
    }
    return m;
  }, [stations]);

  // Every station this user has ever submitted a price at.
  const userContributedStationIds = useMemo(() => {
    const uid = session?.user?.id;
    if (!uid) return new Set<string>();
    const set = new Set<string>();
    for (const p of prices) {
      if (p.user_id === uid && p.station_id != null) set.add(String(p.station_id));
    }
    return set;
  }, [prices, session?.user?.id]);

  // Station id -> display name, used by useRegionProgress to label the
  // new-station discovery toast. Rebuilt only when the station list changes.
  const stationNamesMap = useMemo(() => {
    const m = new globalThis.Map<string, string>();
    for (const s of stations) {
      m.set(String(s.id), getStationDisplayName(s));
    }
    return m;
  }, [stations]);

  // Brand collector feeding the "Margid" accordion under Avastuskaart.
  // Built off the full catalog (ignoring the `Tundmatu` sentinel) so totals
  // stay stable regardless of the LV-stations view toggle. Sorted by
  // done-desc then brand-alpha so the user's trophy row grows top-down.
  const userBrandProgress = useMemo<BrandProgress[]>(() => {
    const perBrand = new globalThis.Map<string, { total: number; done: number; collected: string[] }>();
    for (const s of stations) {
      const brand = getBrand(s.name);
      if (brand === 'Tundmatu') continue;
      const entry = perBrand.get(brand) || { total: 0, done: 0, collected: [] };
      entry.total += 1;
      if (userContributedStationIds.has(String(s.id))) {
        entry.done += 1;
        entry.collected.push(String(s.id));
      }
      perBrand.set(brand, entry);
    }
    const arr: BrandProgress[] = Array.from(perBrand.entries()).map(([brand, v]) => ({
      brand, total: v.total, done: v.done, collectedStationIds: v.collected,
    }));
    arr.sort((a, b) => (b.done - a.done) || a.brand.localeCompare(b.brand, 'et'));
    return arr;
  }, [stations, userContributedStationIds]);

  const { progress: regionProgress, events: celebrationEvents, consumeEvents } = useRegionProgress({
    contributedStationIds: userContributedStationIds,
    maakonnad,
    parishes,
    stationParishMap,
    stationNamesMap,
    emitCelebrations: showDiscoveryMap,
    contributionsReady: !session || pricesLoaded,
    userId: session?.user?.id ?? null,
  });

  // Parish ids where every station has been contributed by whichever user's
  // footprint is currently on screen (mine when self-viewing, viewedUser
  // otherwise), plus a per-parish {done,total} map used for the map-label
  // "X/Y priced" counts. Kept separate from useRegionProgress because that
  // hook fires celebration toasts off self-progress only.
  const { displayCompletedParishIds, displayParishProgress } = useMemo(() => {
    const source = viewedUser ? viewedUser.stationIds : userContributedStationIds;
    const perParish = new globalThis.Map<number, number>();
    for (const sid of source) {
      const pid = stationParishMap.get(sid);
      if (pid != null) perParish.set(pid, (perParish.get(pid) || 0) + 1);
    }
    const done = new Set<number>();
    const progress = new globalThis.Map<number, { done: number; total: number }>();
    for (const p of parishes) {
      if (p.station_count <= 0) continue;
      const d = Math.min(perParish.get(p.id) || 0, p.station_count);
      progress.set(p.id, { done: d, total: p.station_count });
      if (d >= p.station_count) done.add(p.id);
    }
    return { displayCompletedParishIds: done, displayParishProgress: progress };
  }, [viewedUser, userContributedStationIds, parishes, stationParishMap]);

  // Station ids that belong to the focused maakond. Null when no focus set
  // (Map.tsx treats null as "no filter").
  const focusedMaakondStationIds = useMemo(() => {
    if (focusedMaakondId == null) return null;
    const parishIds = new Set<number>();
    for (const p of parishes) {
      if (p.maakond_id === focusedMaakondId) parishIds.add(p.id);
    }
    const set = new Set<string>();
    for (const s of stations) {
      if (s.parish_id != null && parishIds.has(s.parish_id)) set.add(String(s.id));
    }
    return set;
  }, [focusedMaakondId, parishes, stations]);

  const focusedMaakond = useMemo(
    () => (focusedMaakondId != null ? maakonnad.find(m => m.id === focusedMaakondId) ?? null : null),
    [focusedMaakondId, maakonnad],
  );

  const handleShowDiscoveryMapChange = (v: boolean) => {
    setShowDiscoveryMap(v);
    localStorage.setItem('kyts-show-discovery-map', String(v));
    if (session?.user?.id) {
      // Supabase's PostgrestFilterBuilder is thenable — it doesn't send the
      // request until `.then()` is called. Without this, toggling off locally
      // worked but the DB stayed true, so the next page load re-hydrated the
      // old value and the toggle appeared to "come back".
      void supabase.from('user_profiles')
        .upsert({ id: session.user.id, show_discovery_map: v })
        .then(() => {}, () => {});
    }
  };

  const handleSharePubliclyChange = (v: boolean) => {
    setSharePublicly(v);
    if (session?.user?.id) {
      void supabase.from('user_profiles')
        .upsert({ id: session.user.id, share_discovery_publicly: v })
        .then(() => {}, () => {});
    }
  };

  const handleShareReporterNameChange = (v: boolean) => {
    setShareReporterName(v);
    if (session?.user?.id) {
      void supabase.from('user_profiles')
        .upsert({ id: session.user.id, share_reporter_name: v })
        .then(() => {
          // Re-pull v_reporters so the user's own name updates in the price
          // attribution everywhere without a page reload.
          void supabase.from('v_reporters').select('user_id, display_name').then((res) => {
            if (res.data) {
              const map: Record<string, string> = {};
              res.data.forEach((r: any) => { if (r.user_id && r.display_name) map[r.user_id] = r.display_name; });
              setReporterMap(map);
            }
          });
        }, () => {});
    }
  };

  const handleMapStyleChange = (s: 'dark' | 'light') => {
    setMapStyle(s);
    localStorage.setItem('kyts-map-style', s);
    if (session?.user?.id) {
      void supabase.from('user_profiles')
        .upsert({ id: session.user.id, theme: s })
        .then(() => {}, () => {});
    }
  };

  // Fetch another user's footprint via the phase30 SECURITY DEFINER RPC.
  // The RPC itself gates on the target's share_discovery_publicly flag, so
  // an opt-out user's ids never leave the database.
  const handleViewUserFootprint = async (userId: string, displayName: string) => {
    const { data, error } = await supabase.rpc('get_user_footprint', { target_user_id: userId });
    if (error || !data) return;
    const ids = new Set<string>((data as any[]).map(r => String(r.station_id)));
    setViewedUser({ id: userId, name: displayName, stationIds: ids });
    setIsLeaderboardOpen(false);
    setFocusedMaakondId(null);
  };

  const handleOpenPriceForm = () => {
    setIsPriceModalOpen(true);
  };

  const handleDisplayNameChange = session?.user?.id
    ? async (name: string) => {
        setDisplayName(name);
        await supabase.from('user_profiles').upsert({ id: session.user!.id, display_name: name });
      }
    : undefined;

  // Derive all unique brands dynamically
  const uniqueBrands = useMemo(() => {
    const brands = new Set<string>();
    stations.forEach(s => { if (s.name) brands.add(getBrand(s.name)); });
    return Array.from(brands).sort();
  }, [stations]);

  // Compute filtered stations based on Brand Menu ONLY
  const filteredStations = useMemo(() => {
    return stations.filter(station => {
      if (!showLatvianStations && station.country === 'LV') return false;
      // Filter by Brand Menu (canonical chain)
      if (selectedBrands.length > 0 && !selectedBrands.includes(getBrand(station.name))) return false;
      return true;
    });
  }, [stations, selectedBrands, showLatvianStations]);

  // Compute live search dropdown results (max 10 results to not overwhelm UI)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    
    return stations
      .filter(station => {
        const brandMatch = station.name?.toLowerCase().includes(query);
        const cityMatch = station.amenities?.['addr:city']?.toLowerCase().includes(query);
        const streetMatch = station.amenities?.['addr:street']?.toLowerCase().includes(query);
        const nameMatch = station.amenities?.name?.toLowerCase().includes(query);
        
        return brandMatch || cityMatch || streetMatch || nameMatch;
      })
      .slice(0, 10);
  }, [stations, searchQuery]);

  return (
    <main style={{ position: 'relative', width: '100vw', height: 'calc(var(--app-height, 100dvh) + env(safe-area-inset-bottom))', overflow: 'hidden' }}>
      <Map
        stations={filteredStations}
        prices={prices}
        allVotes={votes}
        onStationSelect={setSelectedStation}
        focusedFuelType={selectedFuelType}
        showOnlyFresh={showOnlyFresh}
        highlightCheapest={highlightCheapest}
        selectedStation={selectedStation}
        mapStyle={mapStyle}
        dotStyle={dotStyle}
        showClusters={showClusters}
        hideEmptyDots={hideEmptyDots}
        showStaleDemo={showStaleDemo}
        loyaltyDiscounts={loyaltyDiscounts}
        applyLoyalty={applyLoyalty}
        routePolyline={routePolyline}
        onUserLocationChange={setLiveUserLocation}
        showDiscoveryMap={showDiscoveryMap || !!viewedUser}
        contributedStationIds={viewedUser ? viewedUser.stationIds : userContributedStationIds}
        focusedMaakondId={focusedMaakondId}
        focusedMaakondStationIds={focusedMaakondStationIds}
        maakondGeo={maakondGeo}
        parishGeo={parishGeo}
        completedParishIds={displayCompletedParishIds}
        parishProgress={displayParishProgress}
      />

      {(showDiscoveryMap || viewedUser) && (
        <DiscoveryBanner
          focusedMaakondName={focusedMaakond?.name ?? null}
          focusedMaakondEmoji={focusedMaakond?.emoji ?? null}
          onClearFocus={() => setFocusedMaakondId(null)}
          onTurnOff={() => {
            // When viewing someone else, "turn off" just exits the view and
            // leaves the personal toggle untouched.
            if (viewedUser) setViewedUser(null);
            else handleShowDiscoveryMapChange(false);
          }}
          viewedUserName={viewedUser?.name ?? null}
          onOpenSettings={() => {
            setAvastuskaartFocusTrigger(n => n + 1);
            setIsProfileOpen(true);
          }}
        />
      )}

      <CelebrationOverlay events={celebrationEvents} onDrain={consumeEvents} />

      <PointsToast events={pointsEvents} onDrain={() => setPointsEvents([])} />

      <UpdateBanner />

      <FeedbackReplyToast
        isAuthed={!!session?.user}
        loadDataTrigger={loadDataCounter}
      />

      {/* Top Search & Action Bar */}
      <div style={{ position: 'absolute', top: 'calc(20px + env(safe-area-inset-top))', left: '20px', right: '20px', zIndex: 1000 }}>
        <header className="glass-panel" style={{
          padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
          borderBottomLeftRadius: searchResults.length > 0 ? 0 : undefined,
          borderBottomRightRadius: searchResults.length > 0 ? 0 : undefined,
        }}>
          
          {/* Modern Search Input Container */}
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '8px' }}>
            <Search size={20} color="var(--color-text-muted)" />
            <input 
              type="text" 
              placeholder={t('app.search.placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ 
                background: 'transparent', border: 'none', color: 'var(--color-text)', flex: 1,
                outline: 'none', fontSize: '1rem', width: '100%' 
              }}
            />
          </div>
          
          {/* Action Buttons */}
          <div style={{ display: 'flex', borderLeft: '1px solid var(--color-surface-border)', paddingLeft: '16px', alignItems: 'center' }}>
            {session ? (
              <button aria-label={t('header.aria.profile')} onClick={() => setIsProfileOpen(true)} style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '50%',
                background: session.user?.user_metadata?.avatar_url ? 'transparent' : 'var(--color-primary)',
                color: '#fff', border: 'none', cursor: 'pointer', padding: 0,
                margin: '-8px -10px -8px 0', overflow: 'visible', flexShrink: 0,
                boxShadow: session.user?.user_metadata?.avatar_url ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {session.user?.user_metadata?.avatar_url ? (
                    <img src={session.user.user_metadata.avatar_url} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                  ) : (
                    <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>
                      {displayName ? displayName.charAt(0).toUpperCase() : (session.user.email ? session.user.email.charAt(0).toUpperCase() : '?')}
                    </span>
                  )}
                </div>
                {hasActiveFilters && (
                  <span aria-hidden="true" style={{
                    position: 'absolute', top: -2, right: -2,
                    width: 10, height: 10, borderRadius: '50%',
                    background: 'var(--color-primary)',
                    boxShadow: '0 0 0 2px var(--color-bg)',
                  }} />
                )}
              </button>
            ) : (
              <button aria-label={t('header.aria.profile')} onClick={() => setIsProfileOpen(true)} style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'var(--color-surface-alpha-12)',
                color: 'var(--color-text)', border: 'none', cursor: 'pointer', padding: 0,
                margin: '-8px -10px -8px 0', flexShrink: 0
              }}>
                <UserCircle size={20} />
                {hasActiveFilters && (
                  <span aria-hidden="true" style={{
                    position: 'absolute', top: -2, right: -2,
                    width: 10, height: 10, borderRadius: '50%',
                    background: 'var(--color-primary)',
                    boxShadow: '0 0 0 2px var(--color-bg)',
                  }} />
                )}
              </button>
            )}
          </div>
        </header>

        {/* Quick Fuel Type Selector - Waze-style pills */}
        {searchResults.length === 0 && (
          <div style={{
            display: 'flex', gap: '8px', marginTop: '8px',
            overflowX: 'auto', paddingBottom: '2px',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            position: 'relative',
          }}>
            <BrandPickerPill selected={selectedBrands} onChange={setSelectedBrands} />
            {FUEL_TYPES.map(type => {
              const isActive = selectedFuelType === type;
              const shortLabel = type === 'Bensiin 95' ? '95' : type === 'Bensiin 98' ? '98' : type === 'Diisel' ? 'D' : type;
              return (
                <button
                  key={type}
                  onClick={() => setSelectedFuelType(isActive ? null : type)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '6px 12px',
                    minWidth: '36px',
                    borderRadius: '20px',
                    border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-alpha-12)',
                    background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'var(--color-surface-alpha-06)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    fontSize: '0.85rem',
                    fontWeight: isActive ? '600' : '400',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  {shortLabel}
                </button>
              );
            })}
          </div>
        )}
        
        {/* Search Dropdown Results */}
        {searchResults.length > 0 && (
          <div className="glass-panel" style={{
            marginTop: '1px',
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            maxHeight: '40vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {searchResults.map((station) => (
              <button
                key={station.id}
                onClick={() => {
                  setSelectedStation(station);
                  setSearchQuery(''); // Clear search to close dropdown
                }}
                style={{
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                <span style={{ fontWeight: 500 }}>{getStationDisplayName(station)}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {station.amenities?.['addr:street'] || station.amenities?.['addr:city'] || t('app.search.fallbackCountry')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FAB stack (top → bottom): Camera, Manual, Nearby, Navigation, Stats, Market Insight.
          Bottom of stack stays at 140px so the bottom FAB keeps ~60px of clear
          space above the GPS locator button (which sits at bottom 30px in
          Map.tsx). New FABs extend upward instead of downward. */}
      <button
        className="flex-center"
        onClick={() => setIsCameraOpen(true)}
        title={t('app.fab.camera')}
        style={{
          position: 'absolute', bottom: 'calc(440px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          cursor: 'pointer',
          color: 'var(--color-primary)',
          background: 'var(--color-surface-alpha-06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--color-surface-alpha-12)',
          transition: 'all 0.2s ease',
        }}
      >
        <Camera size={22} />
      </button>

      <button
        className="flex-center"
        onClick={() => setIsManualOpen(true)}
        title={t('app.fab.manual')}
        style={{
          position: 'absolute', bottom: 'calc(380px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          cursor: 'pointer',
          color: '#fb923c',
          background: 'var(--color-surface-alpha-06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--color-surface-alpha-12)',
          transition: 'all 0.2s ease',
        }}
      >
        <Fuel size={22} />
      </button>

      <button
        className="flex-center"
        onClick={() => setIsCheapestNearbyOpen(true)}
        title={t('app.fab.cheapestNearby')}
        style={{
          position: 'absolute', bottom: 'calc(320px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          cursor: 'pointer',
          color: 'var(--color-fab-cheapest)',
          background: 'var(--color-surface-alpha-06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--color-surface-alpha-12)',
          transition: 'all 0.2s ease',
        }}
      >
        <Euro size={22} />
      </button>

      <button
        className="flex-center"
        onClick={() => { setRouteMounted(true); setIsRouteOpen(true); }}
        title={routePolyline ? t('app.fab.routeResults') : t('app.fab.routeFind')}
        style={{
          position: 'absolute', bottom: 'calc(260px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          cursor: 'pointer',
          color: '#22c55e',
          background: 'var(--color-surface-alpha-06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--color-surface-alpha-12)',
          transition: 'all 0.2s ease',
        }}
      >
        <Navigation size={22} />
      </button>

      {routePolyline && (
        <button
          className="flex-center"
          onClick={() => { setRoutePolyline(null); setIsRouteOpen(false); setRouteMounted(false); }}
          title={t('app.fab.cancelRoute')}
          style={{
            position: 'absolute', bottom: 'calc(260px + env(safe-area-inset-bottom))',
            right: 'calc(20px + 50px + 10px)',
            width: '42px', height: '42px', borderRadius: '21px', zIndex: 1000,
            cursor: 'pointer',
            color: '#ef4444',
            background: 'var(--color-surface-alpha-06)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--color-surface-alpha-12)',
            transition: 'all 0.2s ease',
          }}
        >
          <X size={20} />
        </button>
      )}

      <button
        className="flex-center"
        onClick={() => {
          setIsStatsOpen(true);
          if (activeInsight) {
            localStorage.setItem('kyts:market-insight-seen', activeInsight.id);
            setMarketInsightSeenId(activeInsight.id);
          }
        }}
        title={t('app.fab.stats')}
        style={{
          position: 'absolute', bottom: 'calc(200px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          cursor: 'pointer',
          color: '#a855f7',
          background: 'var(--color-surface-alpha-06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid var(--color-surface-alpha-12)',
          transition: 'all 0.2s ease',
        }}
      >
        <TrendingUp size={22} />
        {activeInsight && marketInsightSeenId !== activeInsight.id && (() => {
          const urgent = activeInsight.signal_diesel === 'buy_now' || activeInsight.signal_gasoline === 'buy_now';
          return (
            <span style={{
              position: 'absolute', top: 6, right: 6,
              width: urgent ? 12 : 10, height: urgent ? 12 : 10, borderRadius: 6,
              background: urgent ? '#22c55e' : '#ef4444',
              border: '2px solid var(--color-bg)',
              boxShadow: urgent ? '0 0 10px rgba(34,197,94,0.9)' : '0 0 6px rgba(239,68,68,0.6)',
              pointerEvents: 'none',
            }} />
          );
        })()}
      </button>

      <button
        className="flex-center"
        onClick={() => handleShowDiscoveryMapChange(!showDiscoveryMap)}
        title={t('app.fab.discovery')}
        aria-pressed={showDiscoveryMap}
        style={{
          position: 'absolute', bottom: 'calc(140px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          cursor: 'pointer',
          color: showDiscoveryMap ? '#fff' : '#06b6d4',
          background: showDiscoveryMap ? '#06b6d4' : 'var(--color-surface-alpha-06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${showDiscoveryMap ? '#06b6d4' : 'var(--color-surface-alpha-12)'}`,
          transition: 'all 0.2s ease',
        }}
      >
        <Compass size={22} />
      </button>

      {/* Subtle KütuseKaart Watermark placed at the bottom safe area */}
      <div style={{ 
        position: 'absolute', 
        bottom: 'calc(16px + env(safe-area-inset-bottom))', 
        left: '20px', 
        zIndex: 1000,
        display: 'flex', alignItems: 'center', gap: '6px',
        opacity: 0.8,
        pointerEvents: 'none' // Don't block map clicks
      }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', boxShadow: '0 0 8px var(--color-primary-glow)' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-watermark)', letterSpacing: '0.5px' }}>Kyts</span>
      </div>

      {/* Modals & Drawers — lazy-loaded, each gated by its open-flag so the
          chunk only downloads when the user first triggers that panel. */}
      <Suspense fallback={null}>
        {!!selectedStation && !isPriceModalOpen && (
          <StationDrawer
            station={selectedStation}
            prices={prices.filter(p => p.station_id === selectedStation?.id)}
            allVotes={votes}
            reporterMap={reporterMap}
            session={session}
            isOpen={!!selectedStation && !isPriceModalOpen}
            onClose={() => setSelectedStation(null)}
            onOpenPriceForm={handleOpenPriceForm}
            onOpenReport={() => setIsStationReportOpen(true)}
            onVoteSubmitted={() => loadData()}
            isFavorite={favorites.some(f => f.station_id === selectedStation?.id)}
            onToggleFavorite={async () => {
              if (!session) return setIsAuthOpen(true);
              const isFav = favorites.some(f => f.station_id === selectedStation?.id);
              if (isFav) {
                await supabase.from('user_favorites').delete().eq('user_id', session.user.id).eq('station_id', selectedStation.id);
              } else {
                await supabase.from('user_favorites').insert({ user_id: session.user.id, station_id: selectedStation.id });
              }
              loadData();
            }}
          />
        )}

        {isAuthOpen && (
          <AuthModal
            isOpen={isAuthOpen}
            onClose={() => setIsAuthOpen(false)}
            mapStyle={mapStyle}
            onMapStyleChange={handleMapStyleChange}
          />
        )}

        {isPriceModalOpen && (
          <ManualPriceModal
            station={selectedStation}
            isOpen={isPriceModalOpen}
            onClose={() => setIsPriceModalOpen(false)}
            onPricesSubmitted={handlePricesSubmitted}
            photoExpanded={isPhotoExpanded}
            onPhotoExpandedChange={setIsPhotoExpanded}
          />
        )}

        {/* Camera FAB mode: no pre-selected station, GPS auto-selects */}
        {isCameraOpen && (
          <ManualPriceModal
            station={null}
            isOpen={isCameraOpen}
            onClose={() => { setIsCameraOpen(false); setPendingScanRestore(null); }}
            onPricesSubmitted={handlePricesSubmitted}
            allStations={stations}
            photoExpanded={isPhotoExpanded}
            onPhotoExpandedChange={setIsPhotoExpanded}
            pendingScanRestore={pendingScanRestore}
          />
        )}

        {/* Manual FAB mode: GPS-first, 500 m strict nearby picker, no camera */}
        {isManualOpen && (
          <ManualPriceModal
            mode="manual"
            station={null}
            isOpen={isManualOpen}
            onClose={() => setIsManualOpen(false)}
            onPricesSubmitted={handlePricesSubmitted}
            allStations={stations}
            photoExpanded={isPhotoExpanded}
            onPhotoExpandedChange={setIsPhotoExpanded}
          />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {isProfileOpen && (
        <ProfileDrawer
        session={session}
        displayName={displayName}
        onDisplayNameChange={handleDisplayNameChange}
        onOpenAuth={() => { setIsProfileOpen(false); setIsAuthOpen(true); }}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        favorites={favorites}
        stations={stations}
        prices={prices}
        allVotes={votes}
        reporterMap={reporterMap}
        userVotesCount={votes.filter(v => v.user_id === session?.user?.id).length}
        userPricesCount={prices.filter(p => p.user_id === session?.user?.id).length}
        defaultFuelType={defaultFuelType}
        onDefaultFuelTypeChange={setDefaultFuelType}
        onStationSelect={setSelectedStation}
        preferredBrands={preferredBrands}
        onPreferredBrandsChange={setPreferredBrands}
        allBrands={uniqueBrands}
        selectedFuelType={selectedFuelType}
        setSelectedFuelType={setSelectedFuelType}
        selectedBrands={selectedBrands}
        setSelectedBrands={setSelectedBrands}
        showOnlyFresh={showOnlyFresh}
        setShowOnlyFresh={setShowOnlyFresh}
        highlightCheapest={highlightCheapest}
        setHighlightCheapest={setHighlightCheapest}
        applyLoyalty={applyLoyalty}
        onApplyLoyaltyChange={async (v) => {
          setApplyLoyalty(v);
          localStorage.setItem('kyts-apply-loyalty', String(v));
          if (session?.user?.id) {
            await supabase.from('user_profiles').upsert({ id: session.user.id, apply_loyalty: v });
          }
        }}
        hasAnyDiscount={Object.values(loyaltyDiscounts).some(v => v > 0)}
        dotStyle={dotStyle}
        onDotStyleChange={(s) => { setDotStyle(s); localStorage.setItem('kyts-dot-style', s); }}
        showClusters={showClusters}
        onShowClustersChange={(v) => { setShowClusters(v); localStorage.setItem('kyts-show-clusters', String(v)); }}
        hideEmptyDots={hideEmptyDots}
        onHideEmptyDotsChange={(v) => { setHideEmptyDots(v); localStorage.setItem('kyts-hide-empty-dots', String(v)); }}
        showLatvianStations={showLatvianStations}
        onShowLatvianStationsChange={(v) => { setShowLatvianStations(v); localStorage.setItem('kyts-show-latvian-stations', String(v)); }}
        showStaleDemo={showStaleDemo}
        onShowStaleDemoChange={(v) => { setShowStaleDemo(v); localStorage.setItem('kyts-show-stale-demo', String(v)); }}
        mapStyle={mapStyle}
        onMapStyleChange={handleMapStyleChange}
        onOpenLeaderboard={() => { setIsProfileOpen(false); setIsLeaderboardOpen(true); }}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
        onOpenFeedback={() => setIsFeedbackOpen(true)}
        onOpenTutorial={() => setIsTutorialOpen(true)}
        showDiscoveryMap={showDiscoveryMap}
        onShowDiscoveryMapChange={handleShowDiscoveryMapChange}
        regionProgress={regionProgress}
        brandProgress={userBrandProgress}
        sharePublicly={sharePublicly}
        onSharePubliclyChange={handleSharePubliclyChange}
        shareReporterName={shareReporterName}
        onShareReporterNameChange={handleShareReporterNameChange}
        onMaakondFocus={(id) => {
          // Tile click while stats grid was open but map mode was off:
          // auto-enable the map mode so the focus is actually visible.
          if (!showDiscoveryMap) handleShowDiscoveryMapChange(true);
          setFocusedMaakondId(id);
          setIsProfileOpen(false);
        }}
        pendingAvastuskaartFocus={avastuskaartFocusTrigger}
        allBrandsForLoyalty={uniqueBrands}
        loyaltyDiscounts={loyaltyDiscounts}
        onLoyaltyChange={async (brand, cents) => {
          const next = { ...loyaltyDiscounts };
          if (cents > 0) next[brand] = cents;
          else delete next[brand];
          setLoyaltyDiscounts(next);
          localStorage.setItem('kyts-loyalty-discounts', JSON.stringify(next));
          if (session?.user?.id) {
            if (cents > 0) {
              await supabase.from('user_loyalty_discounts').upsert(
                { user_id: session.user.id, brand, discount_cents: cents },
                { onConflict: 'user_id,brand' }
              );
            } else {
              await supabase.from('user_loyalty_discounts').delete()
                .eq('user_id', session.user.id).eq('brand', brand);
            }
          }
        }}
      />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {isLeaderboardOpen && (
          <LeaderboardDrawer
            isOpen={isLeaderboardOpen}
            onClose={() => setIsLeaderboardOpen(false)}
            currentUserId={session?.user?.id}
            onViewFootprint={handleViewUserFootprint}
            displayName={displayName}
            onDisplayNameChange={handleDisplayNameChange}
          />
        )}

        {isCheapestNearbyOpen && (
          <CheapestNearbyPanel
            isOpen={isCheapestNearbyOpen}
            onClose={() => setIsCheapestNearbyOpen(false)}
            stations={stations}
            prices={prices}
            allVotes={votes}
            reporterMap={reporterMap}
            radius={nearbyRadius}
            onRadiusChange={setNearbyRadius}
            preferredBrands={preferredBrands}
            loyaltyDiscounts={loyaltyDiscounts}
            applyLoyalty={applyLoyalty}
            onStationSelect={setSelectedStation}
            fallbackLocation={liveUserLocation}
          />
        )}

        {routeMounted && <RoutePlanModal
          isOpen={isRouteOpen}
          onClose={() => setIsRouteOpen(false)}
          stations={stations}
          prices={prices}
          allVotes={votes}
          reporterMap={reporterMap}
          loyaltyDiscounts={loyaltyDiscounts}
          applyLoyalty={applyLoyalty}
          selectedFuelType={selectedFuelType}
          onRouteChange={setRoutePolyline}
          onStationSelect={setSelectedStation}
        />}

        {isStatsOpen && (
          <StatisticsDrawer
            isOpen={isStatsOpen}
            onClose={() => setIsStatsOpen(false)}
            stations={stations}
            prices={prices}
            session={session}
            onStationSelect={setSelectedStation}
            insight={activeInsight}
          />
        )}

        {isPrivacyOpen && (
          <PrivacyModal
            isOpen={isPrivacyOpen}
            onClose={() => setIsPrivacyOpen(false)}
            onOpenTerms={() => { setIsPrivacyOpen(false); setIsTermsOpen(true); }}
          />
        )}

        {isTermsOpen && (
          <TermsModal
            isOpen={isTermsOpen}
            onClose={() => setIsTermsOpen(false)}
            onOpenPrivacy={() => { setIsTermsOpen(false); setIsPrivacyOpen(true); }}
          />
        )}

        {isFeedbackOpen && (
          <FeedbackModal
            isOpen={isFeedbackOpen}
            onClose={() => setIsFeedbackOpen(false)}
            session={session}
          />
        )}

        {isStationReportOpen && (
          <StationReportModal
            isOpen={isStationReportOpen}
            onClose={() => setIsStationReportOpen(false)}
            stationId={selectedStation?.id ?? null}
            stationName={selectedStation ? getStationDisplayName(selectedStation) : null}
            session={session}
          />
        )}

        {isTutorialOpen && (
          <TutorialModal
            isOpen={isTutorialOpen}
            onComplete={(outcome, lastStep) => {
              localStorage.setItem('kyts:tutorial-seen', '1');
              capture('tutorial_' + outcome, { last_step: lastStep });
              setIsTutorialOpen(false);
              // Only chain the install prompt when the user actually walked
              // through the tutorial. Skipping signals disinterest — don't
              // pile a second modal onto someone already reaching for the X.
              if (outcome === 'completed' && shouldAutoShowInstallPrompt()) {
                setTimeout(() => setIsInstallPromptOpen(true), 250);
              }
            }}
          />
        )}
        {isInstallPromptOpen && (
          <InstallPromptModal
            isOpen={isInstallPromptOpen}
            onClose={() => setIsInstallPromptOpen(false)}
          />
        )}
      </Suspense>

      <GdprBanner
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
        onAccept={openTutorialAfterGdpr}
        onDecline={openTutorialAfterGdpr}
      />
    </main>
  );
}

export default App;
