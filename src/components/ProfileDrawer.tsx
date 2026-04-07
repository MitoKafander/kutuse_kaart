import { X, LogOut, Star, UserCircle, Fuel, Award } from 'lucide-react';
import { supabase } from '../supabase';
import { getStationDisplayName } from '../utils';

export function ProfileDrawer({ 
  session, 
  isOpen, 
  onClose,
  favorites,
  stations,
  prices,
  userVotesCount,
  userPricesCount,
  defaultFuelType,
  onDefaultFuelTypeChange,
  onStationSelect
}: { 
  session: any;
  isOpen: boolean; 
  onClose: () => void;
  favorites: any[];
  stations: any[];
  prices: any[];
  userVotesCount: number;
  userPricesCount: number;
  defaultFuelType: string | null;
  onDefaultFuelTypeChange: (fuel: string | null) => void;
  onStationSelect: (station: any) => void;
}) {
  if (!isOpen || !session) return null;

  const handleUpdateFuelPref = async (fuel: string) => {
    onDefaultFuelTypeChange(fuel);
    
    // Upsert profile
    await supabase
      .from('user_profiles')
      .upsert({ id: session.user.id, default_fuel_type: fuel });
  };

  const favoriteStations = favorites
    .map(fav => stations.find(s => s.id === fav.station_id))
    .filter(Boolean);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'flex-end',
    }}>
      <div className="glass-panel animate-slide-up" style={{
        width: '100%',
        height: '85vh',
        backgroundColor: 'var(--color-bg)',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        padding: '24px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <UserCircle size={28} color="var(--color-primary)" />
            <h2 className="heading-1">Sinu Profiil</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Gamification / Contribution Score */}
          <div className="glass-panel" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
              <Award size={18} /> Sinu Panus
            </h3>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1, textAlign: 'center', background: 'var(--color-surface)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>{userPricesCount}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Hinda edastatud</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', background: 'var(--color-surface)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-fresh)' }}>{userVotesCount}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Häält antud</div>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="glass-panel" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
              <Fuel size={18} /> Sinu Auto Kütus
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
              Vali oma eelistatud kütusetüüp. Rakendus filtreerib kaardi edaspidi käivitamisel automaatselt selle järgi.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {["Bensiin 95", "Bensiin 98", "Diisel", "LPG"].map(type => (
                <button
                  key={type}
                  onClick={() => handleUpdateFuelPref(type)}
                  style={{
                    flex: '1 1 40%',
                    padding: '12px 0',
                    border: '1px solid',
                    borderColor: defaultFuelType === type ? 'var(--color-primary)' : 'var(--color-surface-border)',
                    background: defaultFuelType === type ? 'var(--color-primary-glow)' : 'var(--color-surface)',
                    color: 'white',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: defaultFuelType === type ? 'bold' : 'normal'
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Favorite Stations */}
          <div className="glass-panel" style={{ padding: '16px', flex: 1 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
              <Star fill="var(--color-warning)" color="var(--color-warning)" size={18} /> Lemmikjaamad
            </h3>
            
            {favoriteStations.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                Sul pole veel ühtegi lemmikjaama lisatud. Lisa neid kaardilt!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {favoriteStations.map(station => {
                  // Find primary price
                  const fuelTypeToShow = defaultFuelType || 'Bensiin 95';
                  const stationPrices = prices.filter(p => p.station_id === station.id && p.fuel_type === fuelTypeToShow);
                  const activePrice = stationPrices[0]?.price;

                  return (
                    <button
                      key={station.id}
                      onClick={() => {
                        onStationSelect(station);
                        onClose();
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
                        borderRadius: '8px', cursor: 'pointer', textAlign: 'left', color: 'white'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 500 }}>{getStationDisplayName(station)}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{station.amenities?.['addr:city'] || 'Eesti'}</span>
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--color-fresh)' }}>
                        {activePrice ? `€${activePrice.toFixed(3)}` : '-'}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

        </div>

        {/* Action Bottom */}
        <button 
          onClick={async () => {
            await supabase.auth.signOut();
            onClose();
          }}
          style={{
            marginTop: '24px',
            background: 'none', border: '1px solid var(--color-stale)', color: 'var(--color-stale)',
            borderRadius: 'var(--radius-md)', padding: '14px', fontSize: '1rem', fontWeight: '500',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}
        >
          <LogOut size={18} /> Logi välja
        </button>
      </div>
    </div>
  );
}
