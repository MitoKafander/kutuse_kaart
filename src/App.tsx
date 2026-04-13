import { useEffect, useState, useMemo, useRef, lazy, Suspense } from 'react';
import { Map } from './components/Map';
import { Search, Filter, LogIn, UserCircle, Fuel, Camera, Euro, Navigation, TrendingUp, X } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { StationDrawer } from './components/StationDrawer';
import { ManualPriceModal } from './components/ManualPriceModal';
import { PrivacyModal } from './components/PrivacyModal';
import { GdprBanner } from './components/GdprBanner';
import { FilterDrawer } from './components/FilterDrawer';
import { ProfileDrawer } from './components/ProfileDrawer';
import { CheapestNearbyPanel } from './components/CheapestNearbyPanel';
import { BrandPickerPill } from './components/BrandPickerPill';

// Lazy-load panels that aren't on the critical first-paint path to keep the
// initial JS bundle under the 500 kB Vercel warning. These are only fetched
// when the user opens them.
const LeaderboardDrawer = lazy(() => import('./components/LeaderboardDrawer').then(m => ({ default: m.LeaderboardDrawer })));
const RoutePlanModal = lazy(() => import('./components/RoutePlanModal').then(m => ({ default: m.RoutePlanModal })));
const StatisticsDrawer = lazy(() => import('./components/StatisticsDrawer').then(m => ({ default: m.StatisticsDrawer })));
import { supabase } from './supabase';
import { getStationDisplayName } from './utils';
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
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCheapestNearbyOpen, setIsCheapestNearbyOpen] = useState(false);
  const [nearbyRadius, setNearbyRadius] = useState(20);
  const [isRouteOpen, setIsRouteOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [routePolyline, setRoutePolyline] = useState<[number, number][] | null>(null);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  
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
  // Uses a ref so the popstate listener always sees current state without re-registering.
  const overlayStateRef = useRef({
    isPriceModalOpen, isCameraOpen, isAuthOpen, isPrivacyOpen,
    isProfileOpen, isFilterOpen, selectedStation, isCheapestNearbyOpen
  });
  overlayStateRef.current = {
    isPriceModalOpen, isCameraOpen, isAuthOpen, isPrivacyOpen,
    isProfileOpen, isFilterOpen, selectedStation, isCheapestNearbyOpen
  };

  // Track how many overlays are open to manage history entries
  const overlayCountRef = useRef(0);
  const overlayCount = [isAuthOpen, isFilterOpen, isProfileOpen, !!selectedStation,
    isPriceModalOpen, isCameraOpen, isCheapestNearbyOpen, isPrivacyOpen]
    .filter(Boolean).length;

  useEffect(() => {
    const prev = overlayCountRef.current;
    if (overlayCount > prev) {
      // New overlay(s) opened — push history entries for each
      for (let i = 0; i < overlayCount - prev; i++) {
        window.history.pushState({ overlay: true }, '');
      }
    } else if (overlayCount < prev) {
      // Overlay(s) closed programmatically — silently pop extra history entries
      // We skip this if count went to 0 from 1, since popstate already consumed it
    }
    overlayCountRef.current = overlayCount;
  }, [overlayCount]);

  useEffect(() => {
    const handlePopState = () => {
      const s = overlayStateRef.current;
      if (s.isPriceModalOpen) setIsPriceModalOpen(false);
      else if (s.isCameraOpen) setIsCameraOpen(false);
      else if (s.isAuthOpen) setIsAuthOpen(false);
      else if (s.isPrivacyOpen) setIsPrivacyOpen(false);
      else if (s.isProfileOpen) setIsProfileOpen(false);
      else if (s.isFilterOpen) setIsFilterOpen(false);
      else if (s.selectedStation) setSelectedStation(null);
      else if (s.isCheapestNearbyOpen) setIsCheapestNearbyOpen(false);
      overlayCountRef.current = Math.max(0, overlayCountRef.current - 1);
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
      const { data: prof } = await supabase.from('user_profiles').select('default_fuel_type, preferred_brands, dot_style, show_clusters, apply_loyalty, display_name').eq('id', currentUser.user.id).single();
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
      if (prof?.apply_loyalty !== null && prof?.apply_loyalty !== undefined) {
        setApplyLoyalty(prof.apply_loyalty);
        localStorage.setItem('kyts-apply-loyalty', String(prof.apply_loyalty));
      }
    } else {
      setFavorites([]);
      setDefaultFuelType(null);
      setPreferredBrands([]);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      loadData(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      loadData(session); // Reload state if user logs in/out
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleOpenPriceForm = () => {
    setIsPriceModalOpen(true);
  };

  // Derive all unique brands dynamically
  const uniqueBrands = useMemo(() => {
    const brands = new Set<string>();
    stations.forEach(s => { if (s.name) brands.add(s.name); });
    return Array.from(brands).sort();
  }, [stations]);

  // Compute filtered stations based on Brand Menu ONLY
  const filteredStations = useMemo(() => {
    return stations.filter(station => {
      // Filter by Brand Menu
      if (selectedBrands.length > 0 && !selectedBrands.includes(station.name)) return false;
      return true;
    });
  }, [stations, selectedBrands]);

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
    <main style={{ position: 'relative', width: '100vw', height: '100dvh', overflow: 'hidden' }}>
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
        showStaleDemo={showStaleDemo}
        loyaltyDiscounts={loyaltyDiscounts}
        applyLoyalty={applyLoyalty}
        routePolyline={routePolyline}
      />

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
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 14px',
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
                  <Fuel size={14} />
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

      {/* FAB stack (top → bottom): Camera, Nearby, Navigation, Stats */}
      <button
        className="glass-panel flex-center"
        onClick={() => setIsCameraOpen(true)}
        title="Pildista hindu"
        style={{
          position: 'absolute', bottom: 'calc(320px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          border: '1px solid var(--color-surface-border)', cursor: 'pointer',
          color: 'var(--color-primary)',
        }}
      >
        <Camera size={22} />
      </button>

      <button
        className="glass-panel flex-center"
        onClick={() => setIsCheapestNearbyOpen(true)}
        title="Odavaim kütus lähedal"
        style={{
          position: 'absolute', bottom: 'calc(260px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          border: '1px solid var(--color-surface-border)', cursor: 'pointer',
          color: '#facc15',
        }}
      >
        <Euro size={22} />
      </button>

      <button
        className="glass-panel flex-center"
        onClick={() => setIsRouteOpen(true)}
        title={routePolyline ? "Näita marsruudi tulemusi" : "Odavaim kütus marsruudil"}
        style={{
          position: 'absolute', bottom: 'calc(200px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          border: '1px solid var(--color-surface-border)', cursor: 'pointer',
          color: '#22c55e',
        }}
      >
        <Navigation size={22} />
      </button>

      {routePolyline && (
        <button
          className="glass-panel flex-center"
          onClick={() => { setRoutePolyline(null); setIsRouteOpen(false); }}
          title="Tühista marsruut"
          style={{
            position: 'absolute', bottom: 'calc(200px + env(safe-area-inset-bottom))',
            right: 'calc(20px + 50px + 10px)',
            width: '42px', height: '42px', borderRadius: '21px', zIndex: 1000,
            border: '1px solid var(--color-surface-border)', cursor: 'pointer',
            color: '#ef4444',
          }}
        >
          <X size={20} />
        </button>
      )}

      <button
        className="glass-panel flex-center"
        onClick={() => setIsStatsOpen(true)}
        title="Statistika"
        style={{
          position: 'absolute', bottom: 'calc(140px + env(safe-area-inset-bottom))', right: '20px',
          width: '50px', height: '50px', borderRadius: '25px', zIndex: 1000,
          border: '1px solid var(--color-surface-border)', cursor: 'pointer',
          color: '#a855f7',
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
      />

      {/* Camera FAB mode: no pre-selected station, GPS auto-selects */}
      <ManualPriceModal
        station={null}
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onPricesSubmitted={() => loadData()}
        allStations={stations}
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
        showStaleDemo={showStaleDemo}
        onShowStaleDemoChange={(v) => { setShowStaleDemo(v); localStorage.setItem('kyts-show-stale-demo', String(v)); }}
        mapStyle={mapStyle}
        onMapStyleChange={setMapStyle}
        onOpenLeaderboard={() => { setIsProfileOpen(false); setIsLeaderboardOpen(true); }}
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
      />

      <Suspense fallback={null}>
        {isRouteOpen && <RoutePlanModal
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
          />
        )}
      </Suspense>

      <PrivacyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />
      
      <GdprBanner onOpenPrivacy={() => setIsPrivacyOpen(true)} />
    </main>
  );
}

export default App;
