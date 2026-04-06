import { X } from 'lucide-react';

export function FilterDrawer({ 
  isOpen, 
  onClose,
  brands,
  selectedBrands,
  setSelectedBrands,
  fuelTypes,
  selectedFuelType,
  setSelectedFuelType
}: { 
  isOpen: boolean, 
  onClose: () => void,
  brands: string[],
  selectedBrands: string[],
  setSelectedBrands: (brands: string[]) => void,
  fuelTypes: string[],
  selectedFuelType: string | null,
  setSelectedFuelType: (type: string | null) => void
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
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'baseline',
    }}>
      <div className="glass-panel animate-slide-up" style={{
        width: '100%',
        maxWidth: '400px',
        height: '100vh',
        backgroundColor: 'var(--color-bg)',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}>
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <h2 className="heading-1">Filtrid</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Fuel Type Filters */}
        <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: 'var(--color-text-muted)' }}>Kütuse Tüüp</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
          <button 
            style={{
              padding: '8px 16px', borderRadius: '50px', border: '1px solid var(--color-surface-border)', cursor: 'pointer',
              background: selectedFuelType === null ? 'var(--color-primary)' : 'var(--color-surface)',
              color: 'white', fontWeight: '500'
            }}
            onClick={() => setSelectedFuelType(null)}
          >
            Kõik
          </button>
          {fuelTypes.map(type => (
            <button 
              key={type}
              style={{
                padding: '8px 16px', borderRadius: '50px', border: '1px solid var(--color-surface-border)', cursor: 'pointer',
                background: selectedFuelType === type ? 'var(--color-primary)' : 'var(--color-surface)',
                color: 'white', fontWeight: '500'
              }}
              onClick={() => setSelectedFuelType(type)}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Brand Filters */}
        <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: 'var(--color-text-muted)' }}>Tankla Kett</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {brands.map(brand => (
            <label key={brand} onClick={(e) => { e.preventDefault(); toggleBrand(brand); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '8px 0' }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '4px', border: '2px solid var(--color-primary)',
                background: selectedBrands.includes(brand) ? 'var(--color-primary)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {selectedBrands.includes(brand) && <CheckIcon />}
              </div>
              <span>{brand}</span>
            </label>
          ))}
        </div>

      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}
