import { useEffect, useState, useMemo } from 'react';
import { Map } from './components/Map';
import { Filter, LogIn, LogOut } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { StationDrawer } from './components/StationDrawer';
import { ManualPriceModal } from './components/ManualPriceModal';
import { FilterDrawer } from './components/FilterDrawer';
import { supabase } from './supabase';
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

  // Compute filtered stations based on Brand and Fuel Type
  const filteredStations = useMemo(() => {
    return stations.filter(station => {
      // Filter by Brand
      if (selectedBrands.length > 0 && !selectedBrands.includes(station.name)) {
        return false;
      }
      return true;
    });
  }, [stations, selectedBrands]);

  return (
    <main style={{ position: 'relative', width: '100vw', height: '100dvh', overflow: 'hidden' }}>
      <Map 
        stations={filteredStations} 
        prices={prices}
        onStationSelect={setSelectedStation} 
        focusedFuelType={selectedFuelType}
        showOnlyFresh={showOnlyFresh}
        highlightCheapest={highlightCheapest}
      />
      
      {/* Top Header Navigation */}
      <header className="glass-panel flex-between" style={{
        position: 'absolute', top: '20px', left: '20px', right: '20px',
        padding: '12px 20px', zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setSelectedStation(null)}>
          <div style={{ 
            width: '12px', height: '12px', borderRadius: '50%', 
            backgroundColor: 'var(--color-primary)', boxShadow: '0 0 10px var(--color-primary-glow)'
          }} />
          <h1 className="heading-1" style={{ fontSize: '1.2rem' }}>KütuseKaart</h1>
        </div>
        
        <div style={{ display: 'flex', gap: '16px' }}>
          <button onClick={() => setIsFilterOpen(true)} style={{ background: 'none', border: 'none', color: (selectedBrands.length > 0 || selectedFuelType) ? 'var(--color-primary)' : 'var(--color-text)', cursor: 'pointer' }}>
            <Filter size={20} />
          </button>
          
          {session ? (
            <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
              <LogOut size={20} />
            </button>
          ) : (
            <button onClick={() => setIsAuthOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
              <LogIn size={20} />
            </button>
          )}
        </div>
      </header>

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
