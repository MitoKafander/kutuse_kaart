import { useState, useEffect } from 'react';
import { X, Navigation, Search, Loader2, MapPin } from 'lucide-react';
import {
  getStationDisplayName, haversineKm, pointToRouteKm,
  isPriceExpired, isPriceFresh, getNetPrice, hasDiscount,
  LoyaltyDiscounts,
} from '../utils';

const FUEL_TYPES = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];
const CORRIDOR_OPTIONS = [1, 2, 5];

interface RouteResult {
  station: any;
  fuelType: string;
  price: number;
  grossPrice: number;
  discounted: boolean;
  isFresh: boolean;
  corridorKm: number;
  progressKm: number; // distance from origin along straight-line
}

type SearchHit = { displayName: string; lat: number; lon: number };

async function searchPlace(q: string): Promise<SearchHit[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ee&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'et' } });
  if (!res.ok) return [];
  const data: any[] = await res.json();
  return data.map(d => ({
    displayName: d.display_name,
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
  }));
}

async function fetchRoute(fromLat: number, fromLon: number, toLat: number, toLon: number): Promise<[number, number][] | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (!coords) return null;
    return coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
  } catch {
    return null;
  }
}

export function RoutePlanModal({
  isOpen,
  onClose,
  stations,
  prices,
  allVotes,
  loyaltyDiscounts = {},
  applyLoyalty = false,
  selectedFuelType,
  onRouteChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  stations: any[];
  prices: any[];
  allVotes: any[];
  loyaltyDiscounts?: LoyaltyDiscounts;
  applyLoyalty?: boolean;
  selectedFuelType: string | null;
  onRouteChange: (route: [number, number][] | null) => void;
}) {
  const [origin, setOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<SearchHit | null>(null);
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [routing, setRouting] = useState(false);
  const [corridorKm, setCorridorKm] = useState(2);
  const [fuel, setFuel] = useState<string>(selectedFuelType || 'Bensiin 95');

  useEffect(() => {
    if (!isOpen) return;
    navigator.geolocation.getCurrentPosition(
      pos => setOrigin({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { maximumAge: 30000, timeout: 8000 }
    );
  }, [isOpen]);

  useEffect(() => { onRouteChange(route); }, [route, onRouteChange]);
  useEffect(() => () => { onRouteChange(null); }, []);

  useEffect(() => {
    if (!origin || !destination) { setRoute(null); return; }
    setRouting(true);
    fetchRoute(origin.lat, origin.lon, destination.lat, destination.lon)
      .then(r => setRoute(r))
      .finally(() => setRouting(false));
  }, [origin, destination]);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const results = await searchPlace(query.trim());
    setHits(results);
    setSearching(false);
  };

  const results: RouteResult[] = (() => {
    if (!route || !origin) return [];
    const out: RouteResult[] = [];
    for (const station of stations) {
      const corridor = pointToRouteKm(station.latitude, station.longitude, route);
      if (corridor > corridorKm) continue;
      const recent = prices
        .filter(p => p.station_id === station.id && p.fuel_type === fuel)
        .sort((a: any, b: any) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())[0];
      if (!recent) continue;
      if (isPriceExpired(recent, allVotes)) continue;
      const net = getNetPrice(recent.price, station.name, loyaltyDiscounts, applyLoyalty);
      out.push({
        station,
        fuelType: fuel,
        price: net,
        grossPrice: recent.price,
        discounted: hasDiscount(station.name, loyaltyDiscounts, applyLoyalty),
        isFresh: isPriceFresh(recent, allVotes),
        corridorKm: corridor,
        progressKm: haversineKm(origin.lat, origin.lon, station.latitude, station.longitude),
      });
    }
    out.sort((a, b) => a.price - b.price);
    return out.slice(0, 20);
  })();

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      zIndex: 1500, display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '100%', backgroundColor: 'var(--color-bg)',
        borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
        padding: '24px 20px calc(24px + env(safe-area-inset-bottom)) 20px',
        display: 'flex', flexDirection: 'column', gap: '16px',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div className="flex-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Navigation size={20} style={{ color: 'var(--color-primary)' }} />
            <h2 className="heading-1">Kuhu sõidad?</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Destination search */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={query}
            placeholder="Sihtkoht (nt Tartu, Pärnu)"
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            style={{
              flex: 1, padding: '10px 12px',
              background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
              borderRadius: '8px', color: 'var(--color-text)', fontSize: '0.95rem', outline: 'none'
            }}
          />
          <button onClick={handleSearch} style={{
            background: 'var(--color-primary)', color: 'white', border: 'none',
            borderRadius: '8px', padding: '0 14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600
          }}>
            {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
          </button>
        </div>

        {hits.length > 0 && !destination && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {hits.map((h, i) => (
              <button key={i} onClick={() => { setDestination(h); setHits([]); setQuery(h.displayName.split(',')[0]); }}
                style={{
                  textAlign: 'left', padding: '10px 12px',
                  background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
                  borderRadius: '8px', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.85rem'
                }}>
                <MapPin size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {h.displayName}
              </button>
            ))}
          </div>
        )}

        {destination && (
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            <strong style={{ color: 'var(--color-text)' }}>Sihtkoht:</strong> {destination.displayName}
            <button onClick={() => { setDestination(null); setRoute(null); }}
              style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.8rem' }}>
              muuda
            </button>
          </div>
        )}

        {/* Corridor + fuel controls */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Koridor:</span>
            {CORRIDOR_OPTIONS.map(r => (
              <button key={r} onClick={() => setCorridorKm(r)} style={{
                padding: '4px 10px', borderRadius: '14px',
                border: corridorKm === r ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                background: corridorKm === r ? 'rgba(59,130,246,0.2)' : 'var(--color-surface)',
                color: corridorKm === r ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '0.8rem', cursor: 'pointer',
              }}>{r}km</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Kütus:</span>
            {FUEL_TYPES.map(f => (
              <button key={f} onClick={() => setFuel(f)} style={{
                padding: '4px 10px', borderRadius: '14px',
                border: fuel === f ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                background: fuel === f ? 'rgba(59,130,246,0.2)' : 'var(--color-surface)',
                color: fuel === f ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '0.8rem', cursor: 'pointer',
              }}>{f === 'Bensiin 95' ? '95' : f === 'Bensiin 98' ? '98' : f === 'Diisel' ? 'D' : f}</button>
            ))}
          </div>
        </div>

        {routing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-text-muted)' }}>
            <Loader2 size={18} className="spin" /> Arvutan marsruuti...
          </div>
        )}

        {!routing && destination && route && results.length === 0 && (
          <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Marsruudi lähedusest ei leitud tanklaid selle kütusetüübiga. Proovi laiemat koridori.
          </div>
        )}

        {results.map(r => (
          <div key={r.station.id} className="glass-panel" style={{
            padding: 14, borderRadius: 'var(--radius-md)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-primary)' }}>€{r.price.toFixed(3)}</span>
                {r.discounted && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>€{r.grossPrice.toFixed(3)}</span>
                )}
                <span style={{ fontSize: '0.7rem', color: r.isFresh ? 'var(--color-fresh)' : 'var(--color-warning)' }}>
                  {r.isFresh ? '● värske' : '● vana'}
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: 2 }}>{getStationDisplayName(r.station)}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                {r.corridorKm < 1 ? `${Math.round(r.corridorKm * 1000)}m teest` : `${r.corridorKm.toFixed(1)}km teest`} · {r.progressKm.toFixed(0)}km lähtest
              </div>
            </div>
            <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${r.station.latitude},${r.station.longitude}`, '_blank')}
              style={{
                background: 'var(--color-primary)', color: 'white', border: 'none',
                borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600
              }}>
              <Navigation size={14} /> Mine
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
