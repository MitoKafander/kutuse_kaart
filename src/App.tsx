import { useEffect, useState, useMemo } from 'react';
import { Map } from './components/Map';
import { Search, Filter, LogIn, LogOut } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { StationDrawer } from './components/StationDrawer';
import { ManualPriceModal } from './components/ManualPriceModal';
import { FilterDrawer } from './components/FilterDrawer';
import { supabase } from './supabase';
import { getStationDisplayName } from './utils';
import './index.css';

const FUEL_TYPES = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];

function App() {
  const [session, setSession] = useState<any>(null);
  
  // Modals state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  
  // Data state
  const [stations, setStations] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [votes, setVotes] = useState<any[]>([]);
  
  // Filter state
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedFuelType, setSelectedFuelType] = useState<string | null>(null);
  const [showOnlyFresh, setShowOnlyFresh] = useState(false);
  const [highlightCheapest, setHighlightCheapest] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // If user unselects fuel type, automatically turn off cheapest highlight
  useEffect(() => {
    if (!selectedFuelType) setHighlightCheapest(false);
  }, [selectedFuelType]);

  // Load Data
  const loadData = async () => {
    const { data: st } = await supabase.from('stations').select('*');
    if (st) setStations(st);
    
    const { data: pr } = await supabase.from('prices').select('*').order('reported_at', { ascending: false });
    if (pr) setPrices(pr);
    
    const { data: vt } = await supabase.from('votes').select('*');
    if (vt) setVotes(vt);
  };

  useEffect(() => {
    loadData();

    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleOpenPriceForm = () => {
    if (!session) {
      setIsAuthOpen(true);
    } else {
      setIsPriceModalOpen(true);
    }
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
        onStationSelect={setSelectedStation} 
        focusedFuelType={selectedFuelType}
        showOnlyFresh={showOnlyFresh}
        highlightCheapest={highlightCheapest}
        selectedStation={selectedStation} /* Pass selected station down to trigger panning */
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
                background: 'transparent', border: 'none', color: 'white', flex: 1, 
                outline: 'none', fontSize: '1rem', width: '100%' 
              }}
            />
          </div>
          
          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '16px', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px' }}>
            <button onClick={() => setIsFilterOpen(true)} style={{ background: 'none', border: 'none', color: (selectedBrands.length > 0 || selectedFuelType || showOnlyFresh || highlightCheapest) ? 'var(--color-primary)' : 'var(--color-text)', cursor: 'pointer', padding: 0 }}>
              <Filter size={20} />
            </button>
            
            {session ? (
              <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer', padding: 0 }}>
                <LogOut size={20} />
              </button>
            ) : (
              <button onClick={() => setIsAuthOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer', padding: 0 }}>
                <LogIn size={20} />
              </button>
            )}
          </div>
        </header>
        
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
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: 'white',
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
        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', letterSpacing: '0.5px' }}>KütuseKaart</span>
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
      />
      
      <StationDrawer 
        station={selectedStation} 
        prices={prices.filter(p => p.station_id === selectedStation?.id)} 
        allVotes={votes}
        session={session}
        isOpen={!!selectedStation && !isPriceModalOpen} 
        onClose={() => setSelectedStation(null)}
        onOpenPriceForm={handleOpenPriceForm}
        onRequireAuth={() => setIsAuthOpen(true)}
        onVoteSubmitted={() => loadData()}
      />
      
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      
      <ManualPriceModal 
        station={selectedStation} 
        isOpen={isPriceModalOpen} 
        onClose={() => setIsPriceModalOpen(false)}
        onPricesSubmitted={() => loadData()}
      />
    </main>
  );
}

export default App;
