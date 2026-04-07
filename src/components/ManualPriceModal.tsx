import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { supabase } from '../supabase';
import { getStationDisplayName } from '../utils';

export function ManualPriceModal({ 
  station,
  isOpen, 
  onClose,
  onPricesSubmitted
}: { 
  station: any,
  isOpen: boolean, 
  onClose: () => void,
  onPricesSubmitted: () => void
}) {
  const [prices, setPrices] = useState<{ [key: string]: string }>({
    "Bensiin 95": "",
    "Bensiin 98": "",
    "Diisel": "",
    "LPG": ""
  });
  const [loading, setLoading] = useState(false);

  if (!isOpen || !station) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Get current user session
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    // Build insert array
    const inserts = Object.entries(prices)
      .filter(([_, price]) => price.trim() !== '') // Only submit filled in prices
      .map(([type, price]) => ({
        station_id: station.id,
        fuel_type: type,
        price: parseFloat(price.replace(',', '.')),
        user_id: user?.id 
      }));

    if (inserts.length > 0) {
      const { error } = await supabase.from('prices').insert(inserts);
      if (error) {
        console.error("Error inserting prices", error);
        alert("Viga hinna salvestamisel!");
      } else {
        onPricesSubmitted();
        onClose();
        // clear local state
        setPrices({ "Bensiin 95": "", "Bensiin 98": "", "Diisel": "", "LPG": "" });
      }
    } else {
      onClose(); // Just close if nothing was typed
    }
    
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'flex-end',
    }}>
      <div className="glass-panel animate-slide-up" style={{
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        padding: '24px 24px calc(24px + env(safe-area-inset-bottom)) 24px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <h2 className="heading-1">Uued Hinnad: {getStationDisplayName(station)}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {Object.keys(prices).map(type => (
            <div key={type} className="glass-panel flex-between" style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontWeight: '500' }}>{type}</span>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>€</span>
                <input 
                  type="number" 
                  step="0.001"
                  placeholder="0.000"
                  value={prices[type]}
                  onChange={e => setPrices({...prices, [type]: e.target.value})}
                  style={{ 
                    background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', 
                    color: 'white', padding: '8px 12px 8px 32px', borderRadius: '8px', outline: 'none',
                    width: '120px', fontSize: '1.2rem', fontWeight: 'bold'
                  }}
                />
              </div>
            </div>
          ))}

          <button type="submit" disabled={loading} style={{
            background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
            padding: '16px', fontSize: '1.1rem', fontWeight: '600', width: '100%', marginTop: '8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}>
            <Check size={20} />
            {loading ? 'Salvestan...' : 'Salvesta'}
          </button>
        </form>
      </div>
    </div>
  );
}
