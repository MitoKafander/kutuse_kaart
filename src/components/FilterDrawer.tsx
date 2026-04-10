import { X, Check } from 'lucide-react';

export function FilterDrawer({ 
  isOpen, 
  onClose,
  brands,
  selectedBrands,
  setSelectedBrands,
  fuelTypes,
  selectedFuelType,
  setSelectedFuelType,
  showOnlyFresh,
  setShowOnlyFresh,
  highlightCheapest,
  setHighlightCheapest
}: { 
  isOpen: boolean, 
  onClose: () => void,
  brands: string[],
  selectedBrands: string[],
  setSelectedBrands: (brands: string[]) => void,
  fuelTypes: string[],
  selectedFuelType: string | null,
  setSelectedFuelType: (type: string | null) => void,
  showOnlyFresh: boolean,
  setShowOnlyFresh: (v: boolean) => void,
  highlightCheapest: boolean,
  setHighlightCheapest: (v: boolean) => void
}) {
  if (!isOpen) return null;

  const toggleBrand = (brand: string) => {
    if (selectedBrands.includes(brand)) {
      setSelectedBrands(selectedBrands.filter(b => b !== brand));
    } else {
      setSelectedBrands([...selectedBrands, brand]);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 2000,
      display: 'flex',
      justifyContent: 'flex-end'
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '100%',
        maxWidth: '400px',
        height: '100dvh',
        backgroundColor: 'var(--color-bg)',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        padding: '24px 24px calc(24px + env(safe-area-inset-bottom)) 24px',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-primary)' }}>Mida otsid?</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Fuel Types (First) */}
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: 'var(--color-text-muted)' }}>Kütuse Tüüp</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px' }}>
              {fuelTypes.map(type => (
                <button
                  key={type}
                  className="glass-panel"
                  onClick={() => setSelectedFuelType(selectedFuelType === type ? null : type)}
                  style={{
                    padding: '8px',
                    minWidth: 0,
                    border: selectedFuelType === type ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                    background: selectedFuelType === type ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    color: selectedFuelType === type ? 'var(--color-primary)' : 'var(--color-text)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Filters (Second) */}
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: 'var(--color-text-muted)' }}>Täpsemad Filtrid</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span>Peida aegunud hinnad (&gt;24h)</span>
                <div 
                  onClick={() => setShowOnlyFresh(!showOnlyFresh)}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px',
                    background: showOnlyFresh ? 'var(--color-fresh)' : 'var(--color-surface)',
                    position: 'relative', transition: 'background 0.2s'
                  }}
                >
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                    position: 'absolute', top: '2px', left: showOnlyFresh ? '22px' : '2px', transition: 'left 0.2s'
                  }}/>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', opacity: selectedFuelType ? 1 : 0.5 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>Leia odavaim kütus</span>
                  {!selectedFuelType && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>*Vali esmalt kütuse tüüp</span>}
                </div>
                <div 
                  onClick={() => {
                    if (selectedFuelType) setHighlightCheapest(!highlightCheapest);
                  }}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px',
                    background: highlightCheapest ? 'gold' : 'var(--color-surface)',
                    position: 'relative', transition: 'background 0.2s'
                  }}
                >
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                    position: 'absolute', top: '2px', left: highlightCheapest ? '22px' : '2px', transition: 'left 0.2s'
                  }}/>
                </div>
              </label>
            </div>
          </div>

          {/* Brand Filters (Last) */}
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: 'var(--color-text-muted)' }}>Kett</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {brands.map(brand => (
                <label key={brand} onClick={(e) => { e.preventDefault(); toggleBrand(brand); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '8px 0', width: '100%' }}>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '4px', border: '2px solid var(--color-primary)',
                    background: selectedBrands.includes(brand) ? 'var(--color-primary)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {selectedBrands.includes(brand) && <Check size={14} color="var(--color-bg)" />}
                  </div>
                  <span>{brand}</span>
                </label>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
