import { useEffect, useState, useMemo, useRef, lazy, Suspense } from 'react';
import { Map } from './components/Map';
import { Search, Filter, LogIn, UserCircle, Camera, Euro, Navigation, TrendingUp, X } from 'lucide-react';
import { FuelPencilIcon } from './components/icons/FuelPencilIcon';
import { AuthModal } from './components/AuthModal';
import { StationDrawer } from './components/StationDrawer';
import { ManualPriceModal } from './components/ManualPriceModal';
import { PrivacyModal } from './components/PrivacyModal';
import { TermsModal } from './components/TermsModal';
import { GdprBanner } from './components/GdprBanner';
import { FilterDrawer } from './components/FilterDrawer';
import { ProfileDrawer } from './components/ProfileDrawer';
import { CheapestNearbyPanel } from './components/CheapestNearbyPanel';
import { BrandPickerPill } from './components/BrandPickerPill';
import { CelebrationOverlay } from './components/CelebrationOverlay';
import { useRegionProgress, type Maakond, type Parish } from './hooks/useRegionProgress';

// Lazy-load panels that aren't on the critical first-paint path to keep the
// initial JS bundle under the 500 kB Vercel warning. These are only fetched
// when the user opens them.
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
      if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)
          && !sessionStorage.getItem('kyts:chunk-reloaded')) {
        sessionStorage.setItem('kyts:chunk-reloaded', '1');
        window.location.reload();
        return new Promise<never>(() => {}); // block render until reload kicks in
      }
      throw err;
    }
  });
}

const LeaderboardDrawer = lazyWithReload(() => import('./components/LeaderboardDrawer').then(m => ({ default: m.LeaderboardDrawer })));
const RoutePlanModal = lazyWithReload(() => import('./components/RoutePlanModal').then(m => ({ default: m.RoutePlanModal })));
const StatisticsDrawer = lazyWithReload(() => import('./components/StatisticsDrawer').then(m => ({ default: m.StatisticsDrawer })));
import { supabase } from './supabase';
import { getStationDisplayName, getBrand } from './utils';
import type { LoyaltyDiscounts } from './utils';
import './index.css';

const FUEL_TYPES = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];

function App() {
  const [session, setSession] = useState<any>(null);
  
  // Modals state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
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
  
  // Data state
  const [stations, setStations] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [votes, setVotes] = useState<any[]>([]);
  
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mapStyle);
  }, [mapStyle]);

  useEffect(() => {
    if (localStorage.getItem('kyts-map-style')) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => setMapStyle(e.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Back button closes the topmost overlay instead of leaving the app.
  // LIFO stack keyed by overlay id: newly-opened overlays are pushed; popstate
  // always closes the most recently opened one. Previous implementation used a
  // count + hard-coded priority chain, which picked the wrong overlay to close
  // whenever the user's open order didn't match that priority.
  const overlayStackRef = useRef<Array<{ id: string; close: () => void }>>([]);
  const suppressPopRef = useRef(0);

  const openOverlays = useMemo(() => {
    const list: Array<{ id: string; close: () => void }> = [];
    if (isPriceModalOpen) list.push({ id: 'priceModal', close: () => setIsPriceModalOpen(false) });
    if (isPhotoExpanded) list.push({ id: 'photoZoom', close: () => setIsPhotoExpanded(false) });
    if (isCameraOpen) list.push({ id: 'camera', close: () => setIsCameraOpen(false) });
    if (isManualOpen) list.push({ id: 'manual', close: () => setIsManualOpen(false) });
    if (isAuthOpen) list.push({ id: 'auth', close: () => setIsAuthOpen(false) });
    if (isPrivacyOpen) list.push({ id: 'privacy', close: () => setIsPrivacyOpen(false) });
    if (isTermsOpen) list.push({ id: 'terms', close: () => setIsTermsOpen(false) });
    if (isProfileOpen) list.push({ id: 'profile', close: () => setIsProfileOpen(false) });
    if (isFilterOpen) list.push({ id: 'filter', close: () => setIsFilterOpen(false) });
    if (selectedStation) list.push({ id: 'station', close: () => setSelectedStation(null) });
    if (isCheapestNearbyOpen) list.push({ id: 'cheapestNearby', close: () => setIsCheapestNearbyOpen(false) });
    return list;
  }, [isPriceModalOpen, isPhotoExpanded, isCameraOpen, isManualOpen, isAuthOpen, isPrivacyOpen, isTermsOpen, isProfileOpen, isFilterOpen, selectedStation, isCheapestNearbyOpen]);

  useEffect(() => {
    const stack = overlayStackRef.current;
    const openIds = new Set(openOverlays.map(o => o.id));
    // 1. Drop any stack entries that are no longer open (programmatic close).
    //    Each removal costs one history entry we must rewind, suppressing our
    //    own popstate handler for that tick so we don't re-close something.
    const removed = stack.filter(e => !openIds.has(e.id));
    if (removed.length) {
      overlayStackRef.current = stack.filter(e => openIds.has(e.id));
      suppressPopRef.current += removed.length;
      window.history.go(-removed.length);
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

  // Load Base Data & User Data
  const loadData = async (activeSession?: any) => {
    const { data: st } = await supabase.from('stations').select('*');
    if (st) setStations(st);
    
    const { data: pr } = await supabase.from('prices').select('*').order('reported_at', { ascending: false }).limit(10000);
    if (pr) setPrices(pr);

    const { data: vt } = await supabase.from('votes').select('*').limit(10000);
    if (vt) setVotes(vt);

    const currentUser = activeSession || session;
    if (currentUser?.user) {
      // Load favorites
      const { data: favs } = await supabase.from('user_favorites').select('*');
      if (favs) setFavorites(favs);
      
      // Load loyalty discounts
      const { data: loyalty } = await supabase.from('user_loyalty_discounts').select('brand, discount_cents');
      if (loyalty) {
        const map: LoyaltyDiscounts = {};
        loyalty.forEach((r: any) => { map[r.brand] = Number(r.discount_cents); });
        setLoyaltyDiscounts(map);
        localStorage.setItem('kyts-loyalty-discounts', JSON.stringify(map));
      }

      // Load preferences
      const { data: prof } = await supabase.from('user_profiles').select('default_fuel_type, preferred_brands, dot_style, show_clusters, hide_empty_dots, show_latvian_stations, apply_loyalty, display_name, show_discovery_map').eq('id', currentUser.user.id).single();
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
      localStorage.removeItem('kyts-hide-empty-dots');
      localStorage.removeItem('kyts-show-clusters');
      localStorage.removeItem('kyts-show-latvian-stations');
      localStorage.removeItem('kyts-dot-style');
      localStorage.removeItem('kyts-apply-loyalty');
      localStorage.removeItem('kyts-loyalty-discounts');
      localStorage.removeItem('kyts-show-discovery-map');
      localStorage.removeItem('kyts-celebrated-regions');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      loadData(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      loadData(session); // Reload state if user logs in/out
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

  const { progress: regionProgress, events: celebrationEvents, consumeEvents } = useRegionProgress({
    contributedStationIds: userContributedStationIds,
    maakonnad,
    parishes,
    stationParishMap,
    emitCelebrations: showDiscoveryMap,
  });

  const handleOpenPriceForm = () => {
    setIsPriceModalOpen(true);
  };

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
    <main style={{ position: 'relative', width: '100vw', height: 'var(--app-height, 100dvh)', overflow: 'hidden' }}>
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
        showDiscoveryMap={showDiscoveryMap}
        contributedStationIds={userContributedStationIds}
      />

      <CelebrationOverlay events={celebrationEvents} onDrain={consumeEvents} />

      {/* Top Search & Action Bar */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', right: '20px', zIndex: 1000 }}>
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
              placeholder="Otsi jaamu, linna..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ 
                background: 'transparent', border: 'none', color: 'var(--color-text)', flex: 1,
                outline: 'none', fontSize: '1rem', width: '100%' 
              }}
            />
          </div>
          
          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '16px', borderLeft: '1px solid var(--color-surface-border)', paddingLeft: '16px' }}>
            <button onClick={() => setIsFilterOpen(true)} style={{ background: 'none', border: 'none', color: (selectedBrands.length > 0 || selectedFuelType || showOnlyFresh || highlightCheapest) ? 'var(--color-primary)' : 'var(--color-text)', cursor: 'pointer', padding: 0 }}>
              <Filter size={20} />
            </button>
            
            {session ? (
              <button onClick={() => setIsProfileOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer', padding: 0 }}>
                <UserCircle size={20} />
              </button>
            ) : (
              <button onClick={() => setIsAuthOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer', padding: 0 }}>
                <LogIn size={20} />
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
                  {station.amenities?.['addr:street'] || station.amenities?.['addr:city'] || 'Eesti'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FAB stack (top → bottom): Camera, Manual, Nearby, Navigation, Stats.
          Bottom of stack stays at 140px so the Stats FAB keeps ~60px of clear
          space above the GPS locator button (which sits at bottom 30px in
          Map.tsx). New FABs extend upward instead of downward. */}
      <button
        className="flex-center"
        onClick={() => setIsCameraOpen(true)}
        title="Pildista hindu"
        style={{
          position: 'absolute', bottom: 'calc(380px + env(safe-area-inset-bottom))', right: '20px',
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
        title="Sisesta hinnad käsitsi"
        style={{
          position: 'absolute', bottom: 'calc(320px + env(safe-area-inset-bottom))', right: '20px',
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
        <FuelPencilIcon size={22} />
      </button>

      <button
        className="flex-center"
        onClick={() => setIsCheapestNearbyOpen(true)}
        title="Odavaim kütus lähedal"
        style={{
          position: 'absolute', bottom: 'calc(260px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          cursor: 'pointer',
          color: '#facc15',
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
        title={routePolyline ? "Näita marsruudi tulemusi" : "Odavaim kütus marsruudil"}
        style={{
          position: 'absolute', bottom: 'calc(200px + env(safe-area-inset-bottom))', right: '20px',
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
          title="Tühista marsruut"
          style={{
            position: 'absolute', bottom: 'calc(200px + env(safe-area-inset-bottom))',
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
        onClick={() => setIsStatsOpen(true)}
        title="Statistika"
        style={{
          position: 'absolute', bottom: 'calc(140px + env(safe-area-inset-bottom))', right: '20px',
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

      {/* Modals & Drawers */}
      <FilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        brands={uniqueBrands}
        selectedBrands={selectedBrands}
        setSelectedBrands={setSelectedBrands}
        fuelTypes={FUEL_TYPES}
        selectedFuelType={selectedFuelType}
        setSelectedFuelType={setSelectedFuelType}
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
      />
      
      <StationDrawer 
        station={selectedStation} 
        prices={prices.filter(p => p.station_id === selectedStation?.id)} 
        allVotes={votes}
        session={session}
        isOpen={!!selectedStation && !isPriceModalOpen} 
        onClose={() => setSelectedStation(null)}
        onOpenPriceForm={handleOpenPriceForm}
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
      
      <AuthModal 
        isOpen={isAuthOpen} 
        onClose={() => setIsAuthOpen(false)} 
      />

      <ManualPriceModal
        station={selectedStation}
        isOpen={isPriceModalOpen}
        onClose={() => setIsPriceModalOpen(false)}
        onPricesSubmitted={() => loadData()}
        photoExpanded={isPhotoExpanded}
        onPhotoExpandedChange={setIsPhotoExpanded}
      />

      {/* Camera FAB mode: no pre-selected station, GPS auto-selects */}
      <ManualPriceModal
        station={null}
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onPricesSubmitted={() => loadData()}
        allStations={stations}
        photoExpanded={isPhotoExpanded}
        onPhotoExpandedChange={setIsPhotoExpanded}
      />

      {/* Manual FAB mode: GPS-first, 500 m strict nearby picker, no camera */}
      <ManualPriceModal
        mode="manual"
        station={null}
        isOpen={isManualOpen}
        onClose={() => setIsManualOpen(false)}
        onPricesSubmitted={() => loadData()}
        allStations={stations}
        photoExpanded={isPhotoExpanded}
        onPhotoExpandedChange={setIsPhotoExpanded}
      />

      <ProfileDrawer
        session={session}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        favorites={favorites}
        stations={stations}
        prices={prices}
        allVotes={votes}
        userVotesCount={votes.filter(v => v.user_id === session?.user?.id).length}
        userPricesCount={prices.filter(p => p.user_id === session?.user?.id).length}
        defaultFuelType={defaultFuelType}
        onDefaultFuelTypeChange={setDefaultFuelType}
        onStationSelect={setSelectedStation}
        preferredBrands={preferredBrands}
        onPreferredBrandsChange={setPreferredBrands}
        allBrands={uniqueBrands}
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
        onMapStyleChange={setMapStyle}
        onOpenLeaderboard={() => { setIsProfileOpen(false); setIsLeaderboardOpen(true); }}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
        showDiscoveryMap={showDiscoveryMap}
        onShowDiscoveryMapChange={(v) => { setShowDiscoveryMap(v); localStorage.setItem('kyts-show-discovery-map', String(v)); }}
        regionProgress={regionProgress}
        displayName={displayName}
        onDisplayNameChange={async (name) => {
          setDisplayName(name);
          if (session?.user?.id) {
            await supabase.from('user_profiles').upsert({ id: session.user.id, display_name: name });
          }
        }}
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

      <Suspense fallback={null}>
        {isLeaderboardOpen && (
          <LeaderboardDrawer
            isOpen={isLeaderboardOpen}
            onClose={() => setIsLeaderboardOpen(false)}
            currentUserId={session?.user?.id}
          />
        )}
      </Suspense>

      <CheapestNearbyPanel
        isOpen={isCheapestNearbyOpen}
        onClose={() => setIsCheapestNearbyOpen(false)}
        stations={stations}
        prices={prices}
        allVotes={votes}
        radius={nearbyRadius}
        onRadiusChange={setNearbyRadius}
        preferredBrands={preferredBrands}
        loyaltyDiscounts={loyaltyDiscounts}
        applyLoyalty={applyLoyalty}
        onStationSelect={setSelectedStation}
        fallbackLocation={liveUserLocation}
      />

      <Suspense fallback={null}>
        {routeMounted && <RoutePlanModal
          isOpen={isRouteOpen}
          onClose={() => setIsRouteOpen(false)}
          stations={stations}
          prices={prices}
          allVotes={votes}
          loyaltyDiscounts={loyaltyDiscounts}
          applyLoyalty={applyLoyalty}
          selectedFuelType={selectedFuelType}
          onRouteChange={setRoutePolyline}
          onStationSelect={setSelectedStation}
        />}
      </Suspense>

      <Suspense fallback={null}>
        {isStatsOpen && (
          <StatisticsDrawer
            isOpen={isStatsOpen}
            onClose={() => setIsStatsOpen(false)}
            stations={stations}
            prices={prices}
            session={session}
            onStationSelect={setSelectedStation}
          />
        )}
      </Suspense>

      <PrivacyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
        onOpenTerms={() => { setIsPrivacyOpen(false); setIsTermsOpen(true); }}
      />

      <TermsModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        onOpenPrivacy={() => { setIsTermsOpen(false); setIsPrivacyOpen(true); }}
      />

      <GdprBanner
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
      />
    </main>
  );
}

export default App;
