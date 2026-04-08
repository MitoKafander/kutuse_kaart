import { useState } from 'react';
import { X, LogOut, Star, UserCircle, Fuel, Award, TrendingDown, TrendingUp, Clock, Building2, Settings, ChevronDown } from 'lucide-react';
import { supabase } from '../supabase';
import { getStationDisplayName } from '../utils';

// --- Contributor Badge System ---
function getContributorBadge(priceCount: number, voteCount: number) {
  const total = priceCount + voteCount;
  if (total >= 50) return { label: 'Legend', color: '#f59e0b', emoji: '🏆' };
  if (total >= 20) return { label: 'Ekspert', color: '#8b5cf6', emoji: '💎' };
  if (total >= 5)  return { label: 'Aktiivne', color: '#3b82f6', emoji: '⚡' };
  return { label: 'Algaja', color: 'var(--color-text-muted)', emoji: '🌱' };
}

// --- Pure SVG Sparkline ---
function Sparkline({ data, color }: { data: number[], color: string }) {
  if (data.length < 2) return <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>—</span>;

  const W = 80, H = 28, pad = 2;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 0.01;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (v - min) / range) * (H - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  const trending = data[data.length - 1] <= data[0]; // price went down = good

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
      {trending 
        ? <TrendingDown size={14} color="var(--color-fresh)" />
        : <TrendingUp size={14} color="var(--color-stale)" />
      }
    </div>
  );
}

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
  onStationSelect,
  preferredBrands,
  onPreferredBrandsChange,
  allBrands,
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
  preferredBrands: string[];
  onPreferredBrandsChange: (brands: string[]) => void;
  allBrands: string[];
}) {
  const [favSort, setFavSort] = useState<'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'fresh'>('name-asc');
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!isOpen || !session) return null;

  const badge = getContributorBadge(userPricesCount, userVotesCount);

  const handleUpdateFuelPref = async (fuel: string) => {
    onDefaultFuelTypeChange(fuel);
    await supabase
      .from('user_profiles')
      .upsert({ id: session.user.id, default_fuel_type: fuel });
  };

  const handleToggleBrand = async (brand: string) => {
    const updated = preferredBrands.includes(brand)
      ? preferredBrands.filter(b => b !== brand)
      : [...preferredBrands, brand];
    onPreferredBrandsChange(updated);
    await supabase
      .from('user_profiles')
      .upsert({ id: session.user.id, preferred_brands: updated });
  };

  const fuelTypeToShow = defaultFuelType || 'Bensiin 95';

  const favoriteStations = favorites
    .map(fav => stations.find(s => s.id === fav.station_id))
    .filter(Boolean)
    .sort((a: any, b: any) => {
      if (favSort === 'name-asc') return getStationDisplayName(a).localeCompare(getStationDisplayName(b), 'et');
      if (favSort === 'name-desc') return getStationDisplayName(b).localeCompare(getStationDisplayName(a), 'et');
      
      // For price/fresh sorts, get most recent price for the active fuel type
      const priceA = prices.filter(p => p.station_id === a.id && p.fuel_type === fuelTypeToShow)
        .sort((x: any, y: any) => new Date(y.reported_at).getTime() - new Date(x.reported_at).getTime())[0];
      const priceB = prices.filter(p => p.station_id === b.id && p.fuel_type === fuelTypeToShow)
        .sort((x: any, y: any) => new Date(y.reported_at).getTime() - new Date(x.reported_at).getTime())[0];
      
      if (favSort === 'price-asc') return (priceA?.price ?? Infinity) - (priceB?.price ?? Infinity);
      if (favSort === 'price-desc') return (priceB?.price ?? 0) - (priceA?.price ?? 0);
      if (favSort === 'fresh') return (new Date(priceB?.reported_at ?? 0).getTime()) - (new Date(priceA?.reported_at ?? 0).getTime());
      return 0;
    });

  // Build recent activity (last 8 items)
  const userPriceEntries = prices
    .filter(p => p.user_id === session.user.id)
    .slice(0, 8)
    .map(p => {
      const station = stations.find(s => s.id === p.station_id);
      const ago = getTimeAgo(p.reported_at);
      return {
        id: p.id,
        text: `${station ? getStationDisplayName(station) : '?'} — ${p.fuel_type} €${p.price.toFixed(3)}`,
        time: ago
      };
    });

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
            <div>
              <h2 className="heading-1" style={{ marginBottom: '2px' }}>Sinu Profiil</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.8rem' }}>{badge.emoji}</span>
                <span style={{ fontSize: '0.8rem', color: badge.color, fontWeight: '600' }}>{badge.label}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Favorite Stations with Sparklines — PRIMARY use case, first */}
          <div className="glass-panel" style={{ padding: '16px' }}>
            <div className="flex-between" style={{ marginBottom: '12px' }}>
              <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
                <Star fill="var(--color-warning)" color="var(--color-warning)" size={18} /> Lemmikjaamad
              </h3>
              {favoriteStations.length > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{favoriteStations.length} jaama</span>
              )}
            </div>

            {/* Sort pills */}
            {favoriteStations.length > 1 && (
              <div style={{
                display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap'
              }}>
                {[
                  { key: 'name-asc', label: 'Nimi A-Z' },
                  { key: 'name-desc', label: 'Nimi Z-A' },
                  { key: 'price-asc', label: 'Odavaim' },
                  { key: 'price-desc', label: 'Kalleim' },
                  { key: 'fresh', label: 'Uusim' },
                ].map(opt => {
                  const isActive = favSort === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setFavSort(opt.key as any)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                        background: isActive ? 'rgba(59,130,246,0.15)' : 'var(--color-surface)',
                        color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        fontSize: '0.75rem',
                        fontWeight: isActive ? '600' : '400',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
            
            {favoriteStations.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                Sul pole veel ühtegi lemmikjaama lisatud. Lisa neid kaardilt!
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {favoriteStations.map(station => {
                  const stationPrices = prices
                    .filter(p => p.station_id === station.id && p.fuel_type === fuelTypeToShow)
                    .sort((a: any, b: any) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime());
                  
                  const activePrice = stationPrices[0]?.price;
                  const reportedAt = stationPrices[0]?.reported_at;
                  const sparkData = stationPrices.slice(0, 10).reverse().map((p: any) => p.price);

                  // Format timestamp
                  let timeLabel = '';
                  if (reportedAt) {
                    const ageH = (Date.now() - new Date(reportedAt).getTime()) / 3600000;
                    const d = new Date(reportedAt);
                    const t = d.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' });
                    if (ageH < 1) timeLabel = 'Just praegu';
                    else if (ageH < 24 && new Date().getDate() === d.getDate()) timeLabel = `Täna ${t}`;
                    else if (ageH < 48) timeLabel = `Eile ${t}`;
                    else timeLabel = `${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`;
                  }

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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {getStationDisplayName(station)}
                        </span>
                        <Sparkline data={sparkData} color="var(--color-primary)" />
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--color-fresh)' }}>
                          {activePrice ? `€${activePrice.toFixed(3)}` : '-'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                          {fuelTypeToShow}
                        </div>
                        {timeLabel && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                            <Clock size={10} /> {timeLabel}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Gamification / Contribution Score + Badge */}
          <div className="glass-panel" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
              <Award size={18} /> Sinu Panus
            </h3>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              <div style={{ flex: 1, textAlign: 'center', background: 'var(--color-surface)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>{userPricesCount}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Hinda edastatud</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', background: 'var(--color-surface)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-fresh)' }}>{userVotesCount}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Häält antud</div>
              </div>
            </div>
            {badge.label !== 'Legend' && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  <span>{badge.emoji} {badge.label}</span>
                  <span>{getNextBadgeTarget(userPricesCount + userVotesCount)} panuseni järgmise astmeni</span>
                </div>
                <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'var(--color-surface)' }}>
                  <div style={{ 
                    width: `${getBadgeProgress(userPricesCount + userVotesCount)}%`,
                    height: '100%', borderRadius: '2px',
                    background: `linear-gradient(90deg, ${badge.color}, var(--color-primary))`,
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Collapsible Settings */}
          <div className="glass-panel" style={{ padding: '16px' }}>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', background: 'none', border: 'none', color: 'var(--color-text-muted)',
                cursor: 'pointer', fontSize: '1rem', padding: 0,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={18} /> Seaded
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {!settingsOpen && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    {defaultFuelType || 'Bensiin 95'}
                    {preferredBrands.length > 0 && ` · ${preferredBrands.length} ketti`}
                  </span>
                )}
                <ChevronDown size={18} style={{
                  transform: settingsOpen ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 0.2s ease'
                }} />
              </span>
            </button>

            {settingsOpen && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Fuel type preference */}
                <div>
                  <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
                    <Fuel size={16} /> Sinu Auto Kütus
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {["Bensiin 95", "Bensiin 98", "Diisel", "LPG"].map(type => (
                      <button
                        key={type}
                        onClick={() => handleUpdateFuelPref(type)}
                        style={{
                          flex: '1 1 40%',
                          padding: '10px 0',
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

                {/* Preferred brands */}
                <div>
                  <h4 style={{ fontSize: '0.85rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
                    <Building2 size={16} /> Eelistatud Tanklad
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                    Vali ketid, mida "Odavaim lähedal" eelistab. Tühi = kõik.
                  </p>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '6px',
                  }}>
                    {allBrands.map(brand => {
                      const isActive = preferredBrands.includes(brand);
                      return (
                        <button
                          key={brand}
                          onClick={() => handleToggleBrand(brand)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '16px',
                            border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                            background: isActive ? 'rgba(59, 130, 246, 0.2)' : 'var(--color-surface)',
                            color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontSize: '0.78rem',
                            fontWeight: isActive ? '600' : '400',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {brand}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recent Activity Feed */}
          {userPriceEntries.length > 0 && (
            <div className="glass-panel" style={{ padding: '16px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
                <Clock size={18} /> Viimased Tegevused
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {userPriceEntries.map(entry => (
                  <div key={entry.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: '1px solid var(--color-surface-border)'
                  }}>
                    <span style={{ fontSize: '0.85rem', color: 'white', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.text}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0, marginLeft: '8px' }}>{entry.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Action Bottom */}
        <button 
          onClick={async () => {
            await supabase.auth.signOut();
            onClose();
          }}
          style={{
            marginTop: '16px',
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

// --- Helper functions ---
function getTimeAgo(dateStr: string): string {
  const h = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  if (h < 1) return 'Just praegu';
  if (h < 24) return `${Math.floor(h)}h tagasi`;
  return `${Math.floor(h / 24)}p tagasi`;
}

function getNextBadgeTarget(total: number): number {
  if (total < 5) return 5 - total;
  if (total < 20) return 20 - total;
  if (total < 50) return 50 - total;
  return 0;
}

function getBadgeProgress(total: number): number {
  if (total < 5) return (total / 5) * 100;
  if (total < 20) return ((total - 5) / 15) * 100;
  if (total < 50) return ((total - 20) / 30) * 100;
  return 100;
}
