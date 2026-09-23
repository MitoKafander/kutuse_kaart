import { useEffect, useState, useMemo, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Map } from './components/Map';
import { Search, UserCircle, Camera, Euro, Navigation, TrendingUp, X, Fuel, Compass, EyeOff } from 'lucide-react';
import { capture } from './utils/analytics';
import { GdprBanner } from './components/GdprBanner';
import { BrandPickerPill } from './components/BrandPickerPill';
import { CelebrationOverlay } from './components/CelebrationOverlay';
import { PointsToast, type PointsEvent } from './components/PointsToast';
import { DiscoveryBanner } from './components/DiscoveryBanner';
import { FreshnessSlider } from './components/FreshnessSlider';
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
// boundary, reload once so they get the new index. The four message variants
// cover Chrome ("Failed to fetch ..."), Safari/WebKit older builds
// ("Importing a module script failed"), Safari/WebKit newer builds
// ("error loading dynamically imported module" — KYTS-WEB-P/Q/R), and the
// MIME-type rejection that Safari throws when a stale chunk request is
// served the SPA index.html instead of a JS file.
function lazyWithReload<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try { return await factory(); }
    catch (err: any) {
      const msg = String(err?.message || '');
      if (/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|is not a valid JavaScript MIME type/i.test(msg)
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
const AdminPriceModal = lazyWithReload(() => import('./components/AdminPriceModal').then(m => ({ default: m.AdminPriceModal })));
import { supabase } from './supabase';
import { getStationDisplayName, getBrand, getPriceAgeHours, AGE_STOPS, EXPIRY_HOURS } from './utils';
import type { LoyaltyDiscounts, BrandProgress } from './utils';
import { shouldAutoShowInstallPrompt } from './utils/install';
import { COUNTRIES, COUNTRY_CODES, DEFAULT_COUNTRY, countryForCoords, toCountryCode, type CountryCode } from './constants/countries';
import {
  readHiddenCountries, writeHiddenCountries, clearCountryPrefs,
  sanitizeHiddenCountries, readActiveCountry, writeActiveCountry,
  ACTIVE_COUNTRY_KEY,
} from './utils/countryPrefs';
import './index.css';

// Bumped from v1 for phase 65: cached region rows now carry a `country`, and a
// v1 cache would render every Latvian and Lithuanian region as Estonian until
// the background refresh landed.
const REGION_CACHE_KEY = 'kyts-regions-v2';

const FUEL_TYPES = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];

// Owner-only price entry (phase62). Long-pressing the camera FAB opens an admin
// modal that inserts prices for any station with a chosen timestamp, bypassing
// the proximity/velocity/band guards — for cross-border postings that can't be
// crowd-sourced. Gated on this UUID; the DB (phase62 triggers + RLS) is the real
// authority, so exposing the id here is harmless. = mikk.rosin@gmail.com.
const KYTS_ADMIN_UID = '3eac34e5-0db4-4d64-a1e8-e5391f83db4a';

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
  const [isAdminPriceOpen, setIsAdminPriceOpen] = useState(false);
  // Station the admin modal opens locked onto (map/StationDrawer flow). null =
  // FAB flow, where the modal shows its own search instead.
  const [adminPreselectStation, setAdminPreselectStation] = useState<any>(null);
  // Long-press bookkeeping for the owner-only admin FAB gesture.
  const adminPressTimer = useRef<number | null>(null);
  const adminLongPressFired = useRef(false);
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
  // One active market insight per country (phase 65); `activeInsight` below
  // narrows it to the user's. A country with too little local price data
  // simply has no row — the drawer then shows its empty state rather than an
  // oil-futures readout pretending to be local advice.
  const [activeInsights, setActiveInsights] = useState<MarketInsight[]>([]);
  const [pointsEvents, setPointsEvents] = useState<PointsEvent[]>([]);
  
  // User specialized state (Phase 8)
  const [favorites, setFavorites] = useState<any[]>([]);
  const [defaultFuelType, setDefaultFuelType] = useState<string | null>(null);
  const [preferredBrands, setPreferredBrands] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState<string>('');
  
  // Filter state
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedFuelType, setSelectedFuelType] = useState<string | null>(null);
  // Max age of a price that still shows on the map, driven by the freshness
  // slider. Defaults to EXPIRY_HOURS — the fixed cutoff the map used to
  // hardcode — so the map opens exactly as it always did. Device-level like
  // theme: remembered locally, not synced to the profile.
  const [maxPriceAgeHours, setMaxPriceAgeHours] = useState<number>(() => {
    // Anything not currently a stop — including the 'all'/30d values an
    // earlier build wrote — falls back to the default rather than wedging the
    // thumb somewhere the scale no longer has.
    const n = Number(localStorage.getItem('kyts-max-price-age'));
    return (AGE_STOPS as readonly number[]).includes(n) ? n : EXPIRY_HOURS;
  });
  const handleMaxPriceAgeChange = (hours: number) => {
    setMaxPriceAgeHours(hours);
    try { localStorage.setItem('kyts-max-price-age', String(hours)); }
    catch { /* private mode */ }
    capture('freshness_slider_changed', { hours });
  };
  const [highlightCheapest, setHighlightCheapest] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const hasActiveFilters = maxPriceAgeHours < EXPIRY_HOURS || highlightCheapest || selectedBrands.length > 0;

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
  // Phase 65: per-country station visibility. Replaces the single
  // show_latvian_stations boolean — an empty array means "show every country".
  const [hiddenCountries, setHiddenCountries] = useState<CountryCode[]>(() => readHiddenCountries());
  // Which country's Avastuskaart is on screen. Region catalogs, boundary
  // polygons and the Avastajad board are all scoped to this, so an Estonian
  // user's counters are exactly what they were before the expansion.
  const [activeCountry, setActiveCountry] = useState<CountryCode>(() => readActiveCountry());
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
      const cached = JSON.parse(localStorage.getItem(REGION_CACHE_KEY) || 'null');
      return Array.isArray(cached?.maakonnad) ? cached.maakonnad : [];
    } catch { return []; }
  });
  const [parishes, setParishes] = useState<Parish[]>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(REGION_CACHE_KEY) || 'null');
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
  // In-flight or settled geojson fetch per country, so switching back and
  // forth is instant. Caching the PROMISE (not the resolved data) is what
  // makes a second effect run while the first is still in the air reuse it
  // rather than issue a duplicate request.
  const maakondGeoCacheRef = useRef<Partial<Record<CountryCode, Promise<any | null>>>>({});
  const parishGeoCacheRef = useRef<Partial<Record<CountryCode, Promise<any | null>>>>({});

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mapStyle);
  }, [mapStyle]);

  // Auto-reload-and-retry recovery: if the previous tab life stashed an
  // in-flight scan before reloading (ManualPriceModal "AI_UPSTREAM_BUSY"
  // escape hatch), re-open the camera modal with the photo + context so
  // the user sees the scan resume instead of starting over.
  // One-shot mount-only restore from sessionStorage; needs window/sessionStorage so can't run during render.
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

  // If user unselects fuel type, automatically turn off cheapest highlight.
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
      // MUST page: the Baltic expansion took the active-station count past
      // PostgREST's 1000-row cap (1,772 as of phase 65), and a bare select
      // silently returns the first 1000 — which dropped most of Lithuania AND
      // 52 Estonian stations off the map. Ordered by id so the pages are a
      // stable partition rather than whatever order the planner picks.
      fetchAllRows('stations', q => q.eq('active', true).order('id', { ascending: true })),
      fetchAllRows('prices', q => q.order('reported_at', { ascending: false }).order('id', { ascending: false })),
      fetchAllRows('votes', q => q.order('created_at', { ascending: false }).order('id', { ascending: false })),
      supabase.from('v_reporters').select('user_id, display_name'),
      // One active insight PER COUNTRY since phase 65 — fetch them all (there
      // are at most a handful) and pick the user's below, rather than letting
      // whichever country generated most recently win.
      supabase.from('market_insights').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(20),
    ]);

    if (stRes.data) {
      setStations(stRes.data);
      try { localStorage.setItem('kyts:cache:stations', JSON.stringify(stRes.data)); }
      catch { /* quota exceeded — non-fatal, next load will retry */ }
    }
    if (prRes.data) setPrices(prRes.data);
    setPricesLoaded(true);
    if (vtRes.data) setVotes(vtRes.data);
    if (insightRes?.data) setActiveInsights(insightRes.data as MarketInsight[]);
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
        // select('*') rather than a column list: user_profiles is RLS-self-only and
        // one row, and listing columns means a deploy that lands before its
        // migration 400s the entire profile fetch (phase 65 added hidden_countries).
        supabase.from('user_profiles').select('*').eq('id', currentUser.user.id).single(),
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
      // hidden_countries (phase 65) wins; fall back to the phase-27 boolean so
      // the preference survives both an unapplied migration and an old row.
      if (Array.isArray(prof?.hidden_countries)) {
        const hidden = sanitizeHiddenCountries(prof.hidden_countries);
        setHiddenCountries(hidden);
        writeHiddenCountries(hidden);
      } else if (prof?.show_latvian_stations === false) {
        setHiddenCountries(['LV']);
        writeHiddenCountries(['LV']);
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
      setHiddenCountries([]);
      // activeCountry is NOT reset — see clearCountryPrefs(). It's device-level
      // like theme, and signing out doesn't move you to another country.
      setDotStyle('info');
      setApplyLoyalty(true);
      setLoyaltyDiscounts({});
      setShowDiscoveryMap(false);
      setSharePublicly(false);
      setShareReporterName(true);
      setViewedUser(null);
      localStorage.removeItem('kyts-hide-empty-dots');
      localStorage.removeItem('kyts-show-clusters');
      clearCountryPrefs();
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
    // loadData is recreated on every render — re-subscribing the auth listener and resize handlers each time would leak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // loadData is stable enough across renders that we drive this effect off `session` only — re-binding on every render would thrash the visibilitychange listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Load region catalog (maakonnad + parishes) once; cache locally so Avastuskaart
  // can render instantly on toggle-ON. Background-refresh from Supabase to keep
  // station_count denormalization current.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // select('*') so a bundle that ships before the phase-65 migration still
      // gets its regions (a missing `country` column would 400 a column list).
      // Rows without one are Estonian by definition — that's what they were.
      const [{ data: mk }, { data: pa }] = await Promise.all([
        supabase.from('maakonnad').select('*'),
        supabase.from('parishes').select('*'),
      ]);
      if (cancelled) return;
      const withCountry = <T extends { country?: string | null }>(rows: T[] | null) =>
        (rows ?? []).map((r) => ({ ...r, country: toCountryCode(r.country) }));
      const mkRows = withCountry(mk as Maakond[] | null) as Maakond[];
      const paRows = withCountry(pa as Parish[] | null) as Parish[];
      if (mk) setMaakonnad(mkRows);
      if (pa) setParishes(paRows);
      try {
        localStorage.setItem(REGION_CACHE_KEY, JSON.stringify({ maakonnad: mkRows, parishes: paRows }));
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

  // Boundary geojson for the active Avastuskaart country, fetched the first
  // time discovery mode opens for it and then kept in memory. Per-country
  // files mean an Estonian user never downloads Latvian or Lithuanian
  // polygons — each pair is ~150 KB gzipped.
  useEffect(() => {
    if (!showDiscoveryMap) return;
    const meta = COUNTRIES[activeCountry];
    let cancelled = false;
    const load = async (
      url: string,
      cache: React.MutableRefObject<Partial<Record<CountryCode, Promise<any | null>>>>,
      set: (v: any) => void,
    ) => {
      const country = activeCountry;
      let pending = cache.current[country];
      if (!pending) {
        // A country whose boundaries haven't been built yet 404s — the map
        // then simply draws no outlines, which is the honest empty state.
        pending = fetch(url)
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null);
        cache.current[country] = pending;
      }
      const data = await pending;
      if (data && !cancelled) set(data);
    };
    // Level-2 outlines are the bigger file and the map hides them below zoom 9
    // anyway, so the level-1 layer is requested first and rendered on arrival.
    void load(meta.boundaries.level1, maakondGeoCacheRef, setMaakondGeo);
    void load(meta.boundaries.level2, parishGeoCacheRef, setParishGeo);
    return () => { cancelled = true; };
  }, [showDiscoveryMap, activeCountry]);

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
      // entry_method 'admin' = owner-curated far/cross-border rows (phase 62);
      // they must not count toward discovery/brand progress (phase 63).
      if (p.user_id === uid && p.station_id != null && p.entry_method !== 'admin') set.add(String(p.station_id));
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
  // The active country's stations. Everything that asks "how am I doing HERE"
  // runs off this: the Avastuskaart badge grid, the brand collector, and
  // Statistics (medians pooled across three countries would describe nowhere).
  // Cheapest-nearby and the route planner deliberately stay cross-border —
  // that's the whole point of a border station — and only drop countries the
  // user switched off.
  const countryStations = useMemo(
    () => stations.filter(s => toCountryCode(s.country) === activeCountry),
    [stations, activeCountry],
  );
  const countryPrices = useMemo(() => {
    const ids = new Set(countryStations.map(s => String(s.id)));
    return prices.filter(p => ids.has(String(p.station_id)));
  }, [countryStations, prices]);

  // Brand collector, scoped to the active country (phase 65 follow-up). It used
  // catalog-wide totals on purpose while Latvia was a 75-station border strip —
  // but across three countries "Circle K 37/246" counts forecourts in Vilnius
  // against an Estonian driver, which is unreachable rather than aspirational.
  // Same country as the badge grid above it: both live in the Avastuskaart panel.
  const userBrandProgress = useMemo<BrandProgress[]>(() => {
    const perBrand = new globalThis.Map<string, { total: number; done: number; collected: string[] }>();
    for (const s of countryStations) {
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
  }, [countryStations, userContributedStationIds]);

  // The Avastuskaart is one country at a time. Scoping the catalog here (not
  // the fetch) keeps every country's badge grid, counters and celebrations
  // self-contained — and keeps an Estonian user's denominators at the exact
  // 15 maakonnad / 78 vallad they were before Latvia and Lithuania existed.
  const countryMaakonnad = useMemo(
    () => maakonnad.filter(m => toCountryCode(m.country) === activeCountry),
    [maakonnad, activeCountry],
  );
  const countryParishes = useMemo(
    () => parishes.filter(p => toCountryCode(p.country) === activeCountry),
    [parishes, activeCountry],
  );

  // Only offer a country switcher for countries that actually have a region
  // catalog seeded — before the Baltic seed runs, that's Estonia alone and
  // the switcher stays hidden.
  const availableCountries = useMemo(() => {
    const seen = new Set<CountryCode>();
    for (const m of maakonnad) seen.add(toCountryCode(m.country));
    seen.add(DEFAULT_COUNTRY);
    return COUNTRY_CODES.filter(c => seen.has(c));
  }, [maakonnad]);

  const { progress: regionProgress, events: celebrationEvents, consumeEvents } = useRegionProgress({
    contributedStationIds: userContributedStationIds,
    maakonnad: countryMaakonnad,
    parishes: countryParishes,
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

  const activeInsight = useMemo<MarketInsight | null>(() => {
    if (!activeInsights.length) return null;
    // A row without `country` predates the migration and is Estonia's.
    return activeInsights.find(i => toCountryCode(i.country) === activeCountry) ?? null;
  }, [activeInsights, activeCountry]);

  // Phase 65 station visibility. Writes BOTH the new array and the phase-27
  // boolean: the array is the truth, the boolean keeps an installed PWA still
  // running the pre-expansion bundle in agreement about Latvia. If the profile
  // write is rejected because the column doesn't exist yet (migration not
  // applied), fall back to writing the legacy boolean alone so the toggle
  // still persists instead of silently doing nothing.
  const handleHiddenCountriesChange = (next: CountryCode[]) => {
    setHiddenCountries(next);
    writeHiddenCountries(next);
    if (session?.user?.id) {
      const uid = session.user.id;
      void supabase.from('user_profiles')
        .upsert({ id: uid, hidden_countries: next, show_latvian_stations: !next.includes('LV') })
        .then(({ error }) => {
          if (!error) return;
          void supabase.from('user_profiles')
            .upsert({ id: uid, show_latvian_stations: !next.includes('LV') })
            .then(() => {}, () => {});
        }, () => {});
    }
  };

  // First fix on the user's position picks their country for them, unless
  // they've already chosen one. A Latvian shouldn't have to find a setting to
  // stop looking at Estonia's discovery map.
  useEffect(() => {
    if (!liveUserLocation) return;
    if (localStorage.getItem(ACTIVE_COUNTRY_KEY)) return;
    const guess = countryForCoords(liveUserLocation.lat, liveUserLocation.lon);
    if (!guess) return;
    // Persist it. Standing where you are is a stronger signal than the browser
    // language guess that got us here, and without writing it the app re-guesses
    // (and briefly re-renders Estonia) on every single load.
    setActiveCountry(prev => {
      if (prev !== guess) writeActiveCountry(guess);
      return guess;
    });
  }, [liveUserLocation]);

  const handleActiveCountryChange = (next: CountryCode) => {
    setActiveCountry(next);
    writeActiveCountry(next);
    // Region focus belongs to the country we're leaving.
    setFocusedMaakondId(null);
  };

  // Centralized so the main-screen filter pill and the profile-settings toggle
  // share one write path (state + localStorage mirror + DB persistence).
  const handleHideEmptyDotsChange = (v: boolean) => {
    setHideEmptyDots(v);
    localStorage.setItem('kyts-hide-empty-dots', String(v));
    if (session?.user?.id) {
      // Thenable Postgrest builder — must call `.then()` to actually send.
      void supabase.from('user_profiles')
        .upsert({ id: session.user.id, hide_empty_dots: v })
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

  // Owner only: open the admin price modal locked onto the currently selected
  // station (from the StationDrawer), bypassing the geo/band guards.
  const handleOpenAdminPriceForm = () => {
    setAdminPreselectStation(selectedStation);
    setIsAdminPriceOpen(true);
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
  // Everything in a country the user hasn't switched off. This is the honest
  // "stations that exist for me" set: the map filters it further by brand,
  // and search runs off it directly so hiding Lithuania also stops Lithuanian
  // stations turning up in the search dropdown.
  const countryVisibleStations = useMemo(
    () => stations.filter(station => !hiddenCountries.includes(toCountryCode(station.country))),
    [stations, hiddenCountries],
  );

  // How many stations would show a price at each slider stop. Drives the
  // read-out, and is what makes the control legible before you touch it: the
  // jump from "24 h" to "30 d" is the difference between 13 and 87 stations
  // in Estonia today.
  const freshnessCountsByStop = useMemo(() => {
    const newestAgeByStation = new globalThis.Map<string, number>();
    for (const p of prices) {
      if (!p.station_id) continue;
      const age = getPriceAgeHours(p, votes);
      const sid = String(p.station_id);
      const prev = newestAgeByStation.get(sid);
      if (prev === undefined || age < prev) newestAgeByStation.set(sid, age);
    }
    const visibleIds = new Set(countryVisibleStations.map(s => String(s.id)));
    return AGE_STOPS.map(stop => {
      let n = 0;
      for (const [sid, age] of newestAgeByStation) if (visibleIds.has(sid) && age <= stop) n++;
      return n;
    });
  }, [prices, votes, countryVisibleStations]);

  const filteredStations = useMemo(() => {
    return countryVisibleStations.filter(station => {
      // Filter by Brand Menu (canonical chain)
      if (selectedBrands.length > 0 && !selectedBrands.includes(getBrand(station.name))) return false;
      return true;
    });
  }, [countryVisibleStations, selectedBrands]);

  // Per-station search index — folded, weighted fields, built once per station
  // list rather than on every keystroke. Diacritics are stripped via NFD so
  // "parnu" matches "Pärnu". Each field carries a weight so relevance ranking
  // (below) can rank a city/brand hit above an incidental street substring.
  const searchIndex = useMemo(() => {
    const fold = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return countryVisibleStations.map((station) => {
      // getBrand returns the 'Tundmatu' sentinel only when name is null — keep
      // that out of the searchable text so unnamed stations don't all match it.
      const canonical = getBrand(station.name);
      const brand = [station.name, canonical !== 'Tundmatu' ? canonical : null]
        .filter(Boolean)
        .join(' ');
      // Most rows carry the settlement in addr:city, but a few rural ones use
      // addr:place / addr:village instead — all three answer "which locality",
      // so they share one field rather than competing as separate ones.
      const locality = [
        station.amenities?.['addr:city'],
        station.amenities?.['addr:place'],
        station.amenities?.['addr:village'],
      ]
        .filter(Boolean)
        .join(' ');
      // Latvian rows overwhelmingly tag novads/pagasts as addr:district /
      // addr:subdistrict and often carry no city at all (46 of them have
      // nothing else to locate them by). Indexed below city weight so an exact
      // city hit still outranks "every station in this novads".
      const adminArea = [
        station.amenities?.['addr:district'],
        station.amenities?.['addr:subdistrict'],
        station.amenities?.['addr:municipality'],
      ]
        .filter(Boolean)
        .join(' ');
      // { folded text, weight }. City/brand outweigh street/operator so a
      // location hint that lands on the actual city beats one that merely
      // appears inside a street name (e.g. "tallinn" as a Kuressaare address).
      return {
        station,
        fields: [
          { text: fold(brand), weight: 5 },
          { text: fold(locality), weight: 5 },
          // alt_name is frequently the ONLY field holding the location — OSM
          // stores "Neste Peetri" there on a row whose name is bare "Neste"
          // and whose addr:city is missing. Without it those stations are
          // unreachable by the name everyone actually calls them.
          { text: fold(adminArea), weight: 3 },
          { text: fold(station.amenities?.alt_name ?? ''), weight: 3 },
          { text: fold(station.amenities?.name ?? ''), weight: 3 },
          { text: fold(station.amenities?.['addr:street'] ?? ''), weight: 2 },
          { text: fold(station.amenities?.operator ?? ''), weight: 1 },
        ],
      };
    });
  }, [countryVisibleStations]);

  // Live dropdown results (max 10, so ranking matters). The query is tokenised
  // on whitespace and *every* token must match some field — so a brand plus a
  // location hint in any order ("olerex pärnu", "rapla circle k") finds the
  // station even though no single field holds the whole string. Matches are
  // then ranked by summed field weight (+3 for a whole-word hit) so the most
  // relevant stations survive the 10-cap instead of arbitrary array order.
  const searchResults = useMemo(() => {
    const fold = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const tokens = fold(searchQuery).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const wholeWord = (text: string, tok: string) =>
      ` ${text} `.includes(` ${tok} `);

    return searchIndex
      .flatMap((entry) => {
        let score = 0;
        for (const tok of tokens) {
          let best = 0;
          for (const field of entry.fields) {
            if (field.text.includes(tok)) {
              const s = field.weight + (wholeWord(field.text, tok) ? 3 : 0);
              if (s > best) best = s;
            }
          }
          if (best === 0) return []; // this token matched nothing → drop station
          score += best;
        }
        return [{ station: entry.station, score }];
      })
      .sort((a, b) => b.score - a.score) // stable: equal scores keep list order
      .slice(0, 10)
      .map((r) => r.station);
  }, [searchIndex, searchQuery]);

  return (
    <main style={{ position: 'relative', width: '100vw', height: 'calc(var(--app-height, 100dvh) + env(safe-area-inset-bottom))', overflow: 'hidden' }}>
      <Map
        stations={filteredStations}
        prices={prices}
        allVotes={votes}
        onStationSelect={setSelectedStation}
        focusedFuelType={selectedFuelType}
        maxPriceAgeHours={maxPriceAgeHours}
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
        homeCenter={COUNTRIES[activeCountry].center}
        homeZoom={COUNTRIES[activeCountry].zoom}
        activeCountry={activeCountry}
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
                  {station.amenities?.['addr:street'] || station.amenities?.['addr:city'] || t(COUNTRIES[toCountryCode(station.country)].nameKey)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FAB stack (top → bottom): Camera, Manual, Nearby, Navigation, Stats,
          Hide-empty toggle, Avastuskaart. 60px pitch. Bottom FAB stays at 140px
          (Avastuskaart↔GPS gap unchanged); the hide-empty toggle takes the slot
          above it and everything else extends upward. GPS locator is at bottom
          30px in Map.tsx. */}
      <button
        className="flex-center"
        onClick={() => {
          // A long-press (handled below) opens the owner-only admin modal and
          // suppresses this click. Normal tap = camera scan.
          if (adminLongPressFired.current) { adminLongPressFired.current = false; return; }
          setIsCameraOpen(true);
        }}
        // Owner only: press-and-hold the camera FAB for ~550 ms to enter admin
        // price entry. No-op handlers for everyone else.
        onPointerDown={session?.user?.id === KYTS_ADMIN_UID ? () => {
          adminLongPressFired.current = false;
          adminPressTimer.current = window.setTimeout(() => {
            adminLongPressFired.current = true;
            setAdminPreselectStation(null); // FAB flow = search for the station
            setIsAdminPriceOpen(true);
          }, 550);
        } : undefined}
        onPointerUp={session?.user?.id === KYTS_ADMIN_UID ? () => {
          if (adminPressTimer.current) { clearTimeout(adminPressTimer.current); adminPressTimer.current = null; }
        } : undefined}
        onPointerLeave={session?.user?.id === KYTS_ADMIN_UID ? () => {
          if (adminPressTimer.current) { clearTimeout(adminPressTimer.current); adminPressTimer.current = null; }
        } : undefined}
        title={t('app.fab.camera')}
        style={{
          position: 'absolute', bottom: 'calc(500px + env(safe-area-inset-bottom))', right: '20px',
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
          position: 'absolute', bottom: 'calc(440px + env(safe-area-inset-bottom))', right: '20px',
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

      {/* Freshness slider — left edge, opposite the action FABs. Hidden in
          discovery mode, where the map is about coverage rather than prices. */}
      {!showDiscoveryMap && (
        <FreshnessSlider
          maxAgeHours={maxPriceAgeHours}
          onChange={handleMaxPriceAgeChange}
          countsByStop={freshnessCountsByStop}
        />
      )}

      <button
        className="flex-center"
        onClick={() => setIsCheapestNearbyOpen(true)}
        title={t('app.fab.cheapestNearby')}
        style={{
          position: 'absolute', bottom: 'calc(380px + env(safe-area-inset-bottom))', right: '20px',
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
          position: 'absolute', bottom: 'calc(320px + env(safe-area-inset-bottom))', right: '20px',
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
            position: 'absolute', bottom: 'calc(320px + env(safe-area-inset-bottom))',
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
          position: 'absolute', bottom: 'calc(260px + env(safe-area-inset-bottom))', right: '20px',
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

      {/* Hide/show stations without prices — same state as the profile
          settings toggle, surfaced as a FAB because it's toggled often.
          Filled when active, mirroring the Avastuskaart toggle below it. */}
      <button
        className="flex-center"
        onClick={() => handleHideEmptyDotsChange(!hideEmptyDots)}
        title={t('profile.settings.hideEmpty.label')}
        aria-pressed={hideEmptyDots}
        style={{
          position: 'absolute', bottom: 'calc(200px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          cursor: 'pointer',
          color: hideEmptyDots ? '#fff' : '#64748b',
          background: hideEmptyDots ? 'var(--color-primary)' : 'var(--color-surface-alpha-06)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${hideEmptyDots ? 'var(--color-primary)' : 'var(--color-surface-alpha-12)'}`,
          transition: 'all 0.2s ease',
        }}
      >
        <EyeOff size={22} />
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
            isAdmin={session?.user?.id === KYTS_ADMIN_UID}
            onOpenAdminPriceForm={handleOpenAdminPriceForm}
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

        {/* Owner-only admin price entry (long-press camera FAB). Bypasses the
            proximity/velocity/band guards via phase62 for far/cross-border
            postings. Only rendered for the owner uid. */}
        {isAdminPriceOpen && session?.user?.id === KYTS_ADMIN_UID && (
          <AdminPriceModal
            isOpen={isAdminPriceOpen}
            onClose={() => setIsAdminPriceOpen(false)}
            allStations={stations}
            onPricesSubmitted={handlePricesSubmitted}
            userId={session?.user?.id ?? null}
            preselectedStation={adminPreselectStation}
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
        maxPriceAgeHours={maxPriceAgeHours}
        onMaxPriceAgeChange={handleMaxPriceAgeChange}
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
        onHideEmptyDotsChange={handleHideEmptyDotsChange}
        hiddenCountries={hiddenCountries}
        onHiddenCountriesChange={handleHiddenCountriesChange}
        activeCountry={activeCountry}
        onActiveCountryChange={handleActiveCountryChange}
        availableCountries={availableCountries}
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
            activeCountry={activeCountry}
            level1Total={regionProgress.maakonnad.total}
            level1Unit={t(COUNTRIES[activeCountry].level1Key)}
          />
        )}

        {isCheapestNearbyOpen && (
          <CheapestNearbyPanel
            isOpen={isCheapestNearbyOpen}
            onClose={() => setIsCheapestNearbyOpen(false)}
            stations={countryVisibleStations}
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
          stations={countryVisibleStations}
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
            stations={countryStations}
            prices={countryPrices}
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
