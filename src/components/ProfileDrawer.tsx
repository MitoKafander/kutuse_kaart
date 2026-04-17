import { useState, useEffect } from 'react';
import { X, LogOut, Star, UserCircle, Fuel, Award, TrendingDown, TrendingUp, Clock, Building2, Settings, ChevronDown, Navigation, MapPin, Layers, Eye, EyeOff, CreditCard, Trophy, Compass } from 'lucide-react';
import type { LoyaltyDiscounts } from '../utils';
import { supabase } from '../supabase';
import { getStationDisplayName, isPriceExpired, isPriceFresh } from '../utils';
import type { RegionProgress } from '../hooks/useRegionProgress';
import { DiscoveryBadgeGrid } from './DiscoveryBadgeGrid';

// --- Contributor Badge System ---
// 20 tiers of escalating absurdity. Thresholds grow ~geometrically so the
// early levels feel attainable and the late ones feel earned.
const CONTRIBUTOR_TIERS: Array<{ min: number; label: string; emoji: string; color: string }> = [
  { min: 0,    label: 'Turist',             emoji: '🌱', color: 'var(--color-text-muted)' },
  { min: 1,    label: 'Uustulnuk',          emoji: '🐣', color: 'var(--color-text-muted)' },
  { min: 3,    label: 'Pumbapiiluja',       emoji: '🔍', color: '#94a3b8' },
  { min: 5,    label: 'Hinnakirjutaja',     emoji: '📝', color: '#3b82f6' },
  { min: 8,    label: 'Kütusenuuskur',      emoji: '👃', color: '#3b82f6' },
  { min: 12,   label: 'Tanklaspioon',       emoji: '🕵️', color: '#3b82f6' },
  { min: 17,   label: 'Bensiinikoer',       emoji: '🐕', color: '#3b82f6' },
  { min: 23,   label: 'Hinnajälitaja',      emoji: '🏃', color: '#8b5cf6' },
  { min: 30,   label: 'Hinnatabaja',        emoji: '🎯', color: '#8b5cf6' },
  { min: 40,   label: 'Diiselidentist',     emoji: '🦷', color: '#8b5cf6' },
  { min: 55,   label: 'Pumbaprofessor',     emoji: '⛽', color: '#8b5cf6' },
  { min: 72,   label: 'Diiselidiplomaat',   emoji: '💧', color: '#ec4899' },
  { min: 95,   label: 'Pumbapoeet',         emoji: '🎭', color: '#ec4899' },
  { min: 120,  label: 'Tanklaskaut',        emoji: '🧭', color: '#ec4899' },
  { min: 155,  label: 'Kütusekaardistaja',  emoji: '🗺️', color: '#ec4899' },
  { min: 195,  label: 'Kütuserüütel',       emoji: '⚔️', color: '#f59e0b' },
  { min: 240,  label: 'Hinnavõitja',        emoji: '🏆', color: '#f59e0b' },
  { min: 295,  label: 'Pumbakuningas',      emoji: '👑', color: '#f59e0b' },
  { min: 360,  label: 'Pumbanõid',          emoji: '🧙', color: '#f59e0b' },
  { min: 440,  label: 'Oktaanioraakel',     emoji: '💎', color: '#f59e0b' },
  { min: 540,  label: 'Hinnaprohvet',       emoji: '🔮', color: '#ef4444' },
  { min: 660,  label: 'Bensiinibaron',      emoji: '🔥', color: '#ef4444' },
  { min: 810,  label: 'Tanklatäht',         emoji: '⭐', color: '#ef4444' },
  { min: 990,  label: 'Küttesultan',        emoji: '🕌', color: '#ef4444' },
  { min: 1200, label: 'Hinnarakett',        emoji: '🚀', color: '#ef4444' },
  { min: 1450, label: 'Liiter-Lord',        emoji: '🎩', color: '#f59e0b' },
  { min: 1750, label: 'Kütuselegend',       emoji: '🌌', color: '#ef4444' },
  { min: 2100, label: 'Diiselpaavst',       emoji: '⛪', color: '#f59e0b' },
  { min: 2500, label: 'Kyts Jumal',         emoji: '😇', color: '#f59e0b' },
  { min: 3000, label: 'Kyts Kõiksus',       emoji: '♾️', color: '#ec4899' },
];

function getContributorBadge(priceCount: number, voteCount: number) {
  const total = priceCount + voteCount;
  let current = CONTRIBUTOR_TIERS[0];
  for (const tier of CONTRIBUTOR_TIERS) {
    if (total >= tier.min) current = tier;
    else break;
  }
  return current;
}

function getNextTier(total: number): typeof CONTRIBUTOR_TIERS[number] | null {
  for (const tier of CONTRIBUTOR_TIERS) {
    if (tier.min > total) return tier;
  }
  return null;
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
  allVotes,
  userVotesCount,
  userPricesCount,
  defaultFuelType,
  onDefaultFuelTypeChange,
  onStationSelect,
  preferredBrands,
  onPreferredBrandsChange,
  allBrands,
  dotStyle,
  onDotStyleChange,
  showClusters,
  onShowClustersChange,
  hideEmptyDots,
  onHideEmptyDotsChange,
  showLatvianStations,
  onShowLatvianStationsChange,
  showStaleDemo,
  onShowStaleDemoChange,
  allBrandsForLoyalty,
  loyaltyDiscounts,
  onLoyaltyChange,
  mapStyle,
  onMapStyleChange,
  onOpenLeaderboard,
  displayName,
  onDisplayNameChange,
  onOpenPrivacy,
  onOpenTerms,
  showDiscoveryMap,
  onShowDiscoveryMapChange,
  regionProgress,
}: {
  session: any;
  isOpen: boolean;
  onClose: () => void;
  favorites: any[];
  stations: any[];
  prices: any[];
  allVotes: any[];
  userVotesCount: number;
  userPricesCount: number;
  defaultFuelType: string | null;
  onDefaultFuelTypeChange: (fuel: string | null) => void;
  onStationSelect: (station: any) => void;
  preferredBrands: string[];
  onPreferredBrandsChange: (brands: string[]) => void;
  allBrands: string[];
  dotStyle: 'info' | 'brand';
  onDotStyleChange: (style: 'info' | 'brand') => void;
  showClusters: boolean;
  onShowClustersChange: (show: boolean) => void;
  hideEmptyDots: boolean;
  onHideEmptyDotsChange: (hide: boolean) => void;
  showLatvianStations: boolean;
  onShowLatvianStationsChange: (show: boolean) => void;
  showStaleDemo: boolean;
  onShowStaleDemoChange: (show: boolean) => void;
  allBrandsForLoyalty: string[];
  loyaltyDiscounts: LoyaltyDiscounts;
  onLoyaltyChange: (brand: string, cents: number) => void;
  mapStyle: 'dark' | 'light';
  onMapStyleChange: (s: 'dark' | 'light') => void;
  onOpenLeaderboard?: () => void;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
  showDiscoveryMap: boolean;
  onShowDiscoveryMapChange: (show: boolean) => void;
  regionProgress: RegionProgress;
}) {
  const [favSort, setFavSort] = useState<'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'fresh'>('name-asc');
  const [activeTab, setActiveTab] = useState<'profile' | 'settings'>('profile');
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  useEffect(() => { setNameDraft(displayName); }, [displayName]);

  if (!isOpen || !session) return null;

  const badge = getContributorBadge(userPricesCount, userVotesCount);

  const handleUpdateFuelPref = async (fuel: string) => {
    onDefaultFuelTypeChange(fuel);
    await supabase
      .from('user_profiles')
      .upsert({ id: session.user.id, default_fuel_type: fuel });
  };

  const handleDotStyleChange = async (style: 'info' | 'brand') => {
    onDotStyleChange(style);
    if (session?.user?.id) {
      await supabase.from('user_profiles').upsert({ id: session.user.id, dot_style: style });
    }
  };

  const handleClusterToggle = async () => {
    const next = !showClusters;
    onShowClustersChange(next);
    if (session?.user?.id) {
      await supabase.from('user_profiles').upsert({ id: session.user.id, show_clusters: next });
    }
  };

  const handleHideEmptyDotsToggle = async () => {
    const next = !hideEmptyDots;
    onHideEmptyDotsChange(next);
    if (session?.user?.id) {
      await supabase.from('user_profiles').upsert({ id: session.user.id, hide_empty_dots: next });
    }
  };

  const handleDiscoveryMapToggle = async () => {
    const next = !showDiscoveryMap;
    onShowDiscoveryMapChange(next);
    if (session?.user?.id) {
      await supabase.from('user_profiles').upsert({ id: session.user.id, show_discovery_map: next });
    }
  };

  const handleShowLatvianStationsToggle = async () => {
    const next = !showLatvianStations;
    onShowLatvianStationsChange(next);
    if (session?.user?.id) {
      await supabase.from('user_profiles').upsert({ id: session.user.id, show_latvian_stations: next });
    }
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
    <div onClick={onClose} style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
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

        {/* Profiil / Seaded tab bar */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '16px', marginBottom: '12px' }}>
          {([
            { key: 'profile', label: 'Profiil' },
            { key: 'settings', label: 'Seaded' },
          ] as const).map(t => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  flex: 1, padding: '10px', cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                  border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                  background: isActive ? 'rgba(59,130,246,0.15)' : 'var(--color-surface)',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  fontSize: '0.9rem', fontWeight: isActive ? 600 : 400,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {activeTab === 'profile' && (<>
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
                  
                  const latestPrice = stationPrices[0];
                  const activePrice = latestPrice?.price;
                  const sparkData = stationPrices.slice(0, 10).reverse().map((p: any) => p.price);
                  const expired = latestPrice ? isPriceExpired(latestPrice, allVotes) : false;
                  const fresh = latestPrice ? isPriceFresh(latestPrice, allVotes) : false;

                  // Format timestamp
                  let timeLabel = '';
                  if (expired) {
                    timeLabel = 'Aegunud';
                  } else if (latestPrice) {
                    const ageH = (Date.now() - new Date(latestPrice.reported_at).getTime()) / 3600000;
                    const d = new Date(latestPrice.reported_at);
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
                        borderRadius: '8px', cursor: 'pointer', textAlign: 'left', color: 'var(--color-text)'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {getStationDisplayName(station)}
                        </span>
                        <Sparkline data={sparkData} color="var(--color-primary)" />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginLeft: '12px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: expired ? 'var(--color-text-muted)' : (fresh ? 'var(--color-fresh)' : 'var(--color-warning)') }}>
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`,
                              '_blank'
                            );
                          }}
                          style={{
                            background: 'none', border: '1px solid var(--color-surface-border)',
                            borderRadius: '8px', padding: '8px', cursor: 'pointer',
                            color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}
                          title="Navigeeri"
                        >
                          <Navigation size={16} />
                        </button>
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
            {(() => {
              const total = userPricesCount + userVotesCount;
              const next = getNextTier(total);
              if (!next) {
                return (
                  <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{badge.emoji} {badge.label}</span>
                    <span>Kõrgeim aste saavutatud</span>
                  </div>
                );
              }
              return (
              <div style={{ marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '4px', gap: '8px' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>{badge.emoji} {badge.label}</span>
                  <span style={{ textAlign: 'right' }}>{getNextBadgeTarget(total)} kuni {next.emoji} {next.label}</span>
                </div>
                <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'var(--color-surface)' }}>
                  <div style={{
                    width: `${getBadgeProgress(total)}%`,
                    height: '100%', borderRadius: '2px',
                    background: `linear-gradient(90deg, ${badge.color}, var(--color-primary))`,
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>
              );
            })()}
          </div>

          <div className="glass-panel" style={{ padding: '14px 16px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 6 }}>
              Kasutajanimi (nähtav edetabelis)
            </label>
            <input
              type="text"
              value={nameDraft}
              maxLength={32}
              placeholder="Anonüümne"
              onChange={e => setNameDraft(e.target.value)}
              onBlur={() => {
                const trimmed = nameDraft.trim();
                if (trimmed !== displayName) onDisplayNameChange(trimmed);
              }}
              style={{
                width: '100%', padding: '8px 10px',
                background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
                borderRadius: 8, color: 'var(--color-text)', fontSize: '0.9rem', outline: 'none',
              }}
            />
          </div>

          {onOpenLeaderboard && (
            <button onClick={onOpenLeaderboard} className="glass-panel" style={{
              padding: '14px 16px', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              color: 'var(--color-text)', width: '100%', textAlign: 'left', fontSize: '1rem',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Trophy size={18} color="var(--color-warning)" /> Edetabel
              </span>
              <ChevronDown size={16} style={{ transform: 'rotate(-90deg)', color: 'var(--color-text-muted)' }} />
            </button>
          )}

          <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1rem', color: 'var(--color-text)' }}>
                <Compass size={18} color="var(--color-primary)" /> Avastuskaart
              </span>
              <div
                onClick={handleDiscoveryMapToggle}
                style={{
                  width: '44px', height: '24px', borderRadius: '12px',
                  background: showDiscoveryMap ? 'var(--color-primary)' : 'var(--color-surface)',
                  position: 'relative', transition: 'background 0.2s',
                  border: '1px solid var(--color-surface-border)',
                }}
              >
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                  position: 'absolute', top: '1px', left: showDiscoveryMap ? '22px' : '2px', transition: 'left 0.2s'
                }}/>
              </div>
            </label>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
              Vaata, millised jaamad oled avastanud. Täida valdu ja maakondi, et tõusta Avastajate edetabelis.
            </p>

            {showDiscoveryMap && (
              <>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', padding: '4px 0' }}>
                  {regionProgress.stations.done}/{regionProgress.stations.total} jaama
                  {' · '}
                  {regionProgress.parishes.done}/{regionProgress.parishes.total} valdu
                  {' · '}
                  {regionProgress.maakonnad.done}/{regionProgress.maakonnad.total} maakonda
                </div>
                <DiscoveryBadgeGrid progress={regionProgress} />
              </>
            )}
          </div>

          </>)}

          {activeTab === 'settings' && (<>
          <div className="glass-panel" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)', fontSize: '1rem', marginBottom: '16px' }}>
              <Settings size={18} /> Seaded
            </div>
            {true && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Theme toggle */}
                <div>
                  <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', color: 'var(--color-text-muted)' }}>
                    Kaardi teema
                  </h4>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['dark', 'light'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => { onMapStyleChange(s); localStorage.setItem('kyts-map-style', s); }}
                        style={{
                          flex: 1, padding: '8px',
                          borderRadius: '8px',
                          border: mapStyle === s ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                          background: mapStyle === s ? 'rgba(59,130,246,0.15)' : 'var(--color-surface)',
                          color: mapStyle === s ? 'var(--color-primary)' : 'var(--color-text)',
                          cursor: 'pointer', fontSize: '0.9rem',
                        }}
                      >
                        {s === 'dark' ? 'Tume' : 'Hele'}
                      </button>
                    ))}
                  </div>
                </div>

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
                          color: 'var(--color-text)',
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

                {/* Preferred brands (collapsible) */}
                <div>
                  <button
                    onClick={() => setBrandsOpen(!brandsOpen)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', background: 'none', border: 'none',
                      color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                      <Building2 size={16} /> Eelistatud Tanklad
                      {preferredBrands.length > 0 && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)' }}>
                          ({preferredBrands.length} valitud)
                        </span>
                      )}
                    </span>
                    <ChevronDown size={16} style={{
                      transform: brandsOpen ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform .2s',
                    }} />
                  </button>
                  {brandsOpen && (<>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '10px 0' }}>
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
                  </>)}
                </div>

                {/* Loyalty card discounts (collapsible) */}
                <div>
                  <button
                    onClick={() => setLoyaltyOpen(!loyaltyOpen)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', background: 'none', border: 'none',
                      color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                      <CreditCard size={16} /> Kliendikaardid
                      {Object.values(loyaltyDiscounts).filter(v => v > 0).length > 0 && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)' }}>
                          ({Object.values(loyaltyDiscounts).filter(v => v > 0).length} aktiivset)
                        </span>
                      )}
                    </span>
                    <ChevronDown size={16} style={{
                      transform: loyaltyOpen ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform .2s',
                    }} />
                  </button>
                  {loyaltyOpen && (
                  <>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '10px 0' }}>
                    Sisesta soodustus sentides liitri kohta (nt Alexela kliendikaart -4). Kuvatakse kaardil ja "Odavaim lähedal" kasutab sooduskaardi hinda järjestamiseks.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {allBrandsForLoyalty.map(brand => {
                      const current = loyaltyDiscounts[brand] ?? 0;
                      return (
                        <div key={brand} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px', background: 'var(--color-surface)',
                          border: '1px solid var(--color-surface-border)', borderRadius: '8px'
                        }}>
                          <span style={{ fontSize: '0.85rem' }}>{brand}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>−</span>
                            <input
                              type="number"
                              min={0}
                              max={50}
                              step={0.5}
                              value={current || ''}
                              placeholder="0"
                              onChange={e => {
                                const v = parseFloat(e.target.value);
                                onLoyaltyChange(brand, isNaN(v) ? 0 : v);
                              }}
                              style={{
                                width: '64px', textAlign: 'right',
                                background: 'var(--color-bg)', border: '1px solid var(--color-surface-border)',
                                color: 'var(--color-text)', borderRadius: '6px',
                                padding: '4px 8px', fontSize: '0.85rem', outline: 'none'
                              }}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>¢/L</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </>
                  )}
                </div>

                {/* Dot style preference */}
                <div>
                  <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
                    <MapPin size={16} /> Kaardi Punktid
                  </h4>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {([
                      { key: 'info', label: 'Info', desc: 'Hallid = andmed puudu' },
                      { key: 'brand', label: 'Bränd', desc: 'Kõik brändi värvis' },
                    ] as const).map(opt => {
                      const isActive = dotStyle === opt.key;
                      return (
                        <button
                          key={opt.key}
                          onClick={() => handleDotStyleChange(opt.key)}
                          style={{
                            flex: 1,
                            padding: '10px 8px',
                            border: '1px solid',
                            borderColor: isActive ? 'var(--color-primary)' : 'var(--color-surface-border)',
                            background: isActive ? 'var(--color-primary-glow)' : 'var(--color-surface)',
                            color: 'var(--color-text)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: isActive ? 'bold' : 'normal',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span style={{ fontSize: '0.85rem' }}>{opt.label}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Clustering toggle */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      <Layers size={16} /> Grupeeri lähedased jaamad
                    </span>
                    <div
                      onClick={handleClusterToggle}
                      style={{
                        width: '44px', height: '24px', borderRadius: '12px',
                        background: showClusters ? 'var(--color-primary)' : 'var(--color-surface)',
                        position: 'relative', transition: 'background 0.2s'
                      }}
                    >
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                        position: 'absolute', top: '2px', left: showClusters ? '22px' : '2px', transition: 'left 0.2s'
                      }}/>
                    </div>
                  </label>
                </div>

                {/* Hide stations without fresh price data — cuts mobile clutter */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        <EyeOff size={16} /> Peida jaamad ilma hindadeta
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', paddingLeft: '24px' }}>
                        Kiirem pan/zoom, vähem segadust
                      </span>
                    </div>
                    <div
                      onClick={handleHideEmptyDotsToggle}
                      style={{
                        width: '44px', height: '24px', borderRadius: '12px',
                        background: hideEmptyDots ? 'var(--color-primary)' : 'var(--color-surface)',
                        position: 'relative', transition: 'background 0.2s'
                      }}
                    >
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                        position: 'absolute', top: '2px', left: hideEmptyDots ? '22px' : '2px', transition: 'left 0.2s'
                      }}/>
                    </div>
                  </label>
                </div>

                {/* Show Latvian border-strip stations on the map */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        <MapPin size={16} /> Näita Läti jaamu
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', paddingLeft: '24px' }}>
                        Piiriäärsed jaamad Lätis
                      </span>
                    </div>
                    <div
                      onClick={handleShowLatvianStationsToggle}
                      style={{
                        width: '44px', height: '24px', borderRadius: '12px',
                        background: showLatvianStations ? 'var(--color-primary)' : 'var(--color-surface)',
                        position: 'relative', transition: 'background 0.2s'
                      }}
                    >
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                        position: 'absolute', top: '2px', left: showLatvianStations ? '22px' : '2px', transition: 'left 0.2s'
                      }}/>
                    </div>
                  </label>
                </div>

                {/* Demo: show stale/expired prices (>24h) */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        <Eye size={16} /> Näita aegunud hindu (demo)
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', paddingLeft: '24px' }}>
                        Kuvab ka &gt;24h vanu hindu
                      </span>
                    </div>
                    <div
                      onClick={() => onShowStaleDemoChange(!showStaleDemo)}
                      style={{
                        width: '44px', height: '24px', borderRadius: '12px',
                        background: showStaleDemo ? 'var(--color-warning)' : 'var(--color-surface)',
                        position: 'relative', transition: 'background 0.2s'
                      }}
                    >
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                        position: 'absolute', top: '2px', left: showStaleDemo ? '22px' : '2px', transition: 'left 0.2s'
                      }}/>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
          </>)}

          {activeTab === 'profile' && userPriceEntries.length > 0 && (
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
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.text}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0, marginLeft: '8px' }}>{entry.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Legal links — surface on the Seaded tab alongside other preferences */}
        {activeTab === 'settings' && (onOpenPrivacy || onOpenTerms) && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '12px',
            marginTop: '20px', fontSize: '0.78rem', color: 'var(--color-text-muted)'
          }}>
            {onOpenTerms && (
              <button onClick={() => { onOpenTerms(); onClose(); }} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>
                Kasutustingimused
              </button>
            )}
            {onOpenPrivacy && onOpenTerms && <span>·</span>}
            {onOpenPrivacy && (
              <button onClick={() => { onOpenPrivacy(); onClose(); }} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>
                Privaatsuspoliitika
              </button>
            )}
          </div>
        )}

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
  const next = getNextTier(total);
  return next ? next.min - total : 0;
}

function getBadgeProgress(total: number): number {
  const next = getNextTier(total);
  if (!next) return 100;
  // Find current tier's minimum to compute progress within the band.
  let curMin = 0;
  for (const tier of CONTRIBUTOR_TIERS) {
    if (tier.min <= total) curMin = tier.min;
    else break;
  }
  const span = next.min - curMin;
  if (span <= 0) return 100;
  return ((total - curMin) / span) * 100;
}
