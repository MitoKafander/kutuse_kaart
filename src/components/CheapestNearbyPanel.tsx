import { useState, useEffect } from 'react';
import { X, Navigation, MapPin, Loader2 } from 'lucide-react';
import { haversineKm, getStationDisplayName, isPriceExpired, isPriceFresh } from '../utils';

const FUEL_TYPES = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];
const RADIUS_OPTIONS = [5, 10, 20];

interface NearbyResult {
  fuelType: string;
  price: number;
  station: any;
  distanceKm: number;
  isFresh: boolean;
}

function findCheapestNearby(
  stations: any[],
  prices: any[],
  allVotes: any[],
  userLat: number,
  userLon: number,
  radiusKm: number,
  preferredBrands: string[] = []
): NearbyResult[] {
  const results: NearbyResult[] = [];

  for (const fuelType of FUEL_TYPES) {
    let best: NearbyResult | null = null;

    for (const station of stations) {
      if (preferredBrands.length > 0 && !preferredBrands.includes(station.name)) continue;
      const dist = haversineKm(userLat, userLon, station.latitude, station.longitude);
      if (dist > radiusKm) continue;

      const recentPrice = prices
        .filter(p => p.station_id === station.id && p.fuel_type === fuelType)
        .sort((a: any, b: any) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())[0];

      if (!recentPrice) continue;
      if (isPriceExpired(recentPrice, allVotes)) continue;

      if (!best || recentPrice.price < best.price) {
        best = {
          fuelType,
          price: recentPrice.price,
          station,
          distanceKm: dist,
          isFresh: isPriceFresh(recentPrice, allVotes),
        };
      }
    }

    if (best) results.push(best);
  }

  return results;
}

export function CheapestNearbyPanel({
  isOpen,
  onClose,
  stations,
  prices,
  allVotes,
  radius,
  onRadiusChange,
  preferredBrands = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  stations: any[];
  prices: any[];
  allVotes: any[];
  radius: number;
  onRadiusChange: (r: number) => void;
  preferredBrands?: string[];
}) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLocating(true);
    setLocationError(false);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setIsLocating(false);
      },
      () => {
        setLocationError(true);
        setIsLocating(false);
      },
      { maximumAge: 30000, timeout: 8000 }
    );
  }, [isOpen]);

  if (!isOpen) return null;

  const results = userLocation
    ? findCheapestNearby(stations, prices, allVotes, userLocation.lat, userLocation.lon, radius, preferredBrands)
    : [];

  const fuelLabel: Record<string, string> = {
    'Bensiin 95': '95',
    'Bensiin 98': '98',
    'Diisel': 'D',
    'LPG': 'LPG',
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 1500,
      display: 'flex',
      alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        padding: '24px 20px calc(24px + env(safe-area-inset-bottom)) 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div className="flex-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MapPin size={20} style={{ color: 'var(--color-primary)' }} />
            <h2 className="heading-1">Odavaim kütus sinu lähedal</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Radius selector */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginRight: '4px' }}>Raadius:</span>
          {RADIUS_OPTIONS.map(r => (
            <button
              key={r}
              onClick={() => onRadiusChange(r)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: radius === r ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-alpha-12)',
                background: radius === r ? 'rgba(59, 130, 246, 0.2)' : 'var(--color-surface-alpha-06)',
                color: radius === r ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: '0.85rem',
                fontWeight: radius === r ? '600' : '400',
                cursor: 'pointer',
              }}
            >
              {r} km
            </button>
          ))}
        </div>

        {/* Preferred brands indicator */}
        {preferredBrands.length > 0 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Filtreeritud:</span>
            <span style={{ color: 'var(--color-primary)', fontWeight: '500' }}>{preferredBrands.join(', ')}</span>
          </div>
        )}

        {/* Content */}
        {isLocating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-text-muted)', padding: '16px 0' }}>
            <Loader2 size={20} className="spin" />
            <span>Otsib sinu asukohta...</span>
          </div>
        )}

        {locationError && !isLocating && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)', padding: '14px 16px',
            fontSize: '0.9rem', color: 'var(--color-text)'
          }}>
            Asukoht pole saadaval. Luba rakendusele asukoha kasutamine ja proovi uuesti.
          </div>
        )}

        {userLocation && !isLocating && results.length === 0 && (
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
            borderRadius: 'var(--radius-md)', padding: '14px 16px',
            fontSize: '0.9rem', color: 'var(--color-text-muted)', textAlign: 'center'
          }}>
            Selles raadiuses hindu ei leitud. Proovi suuremat raadiust.
          </div>
        )}

        {results.map(result => (
          <div
            key={result.fuelType}
            className="glass-panel"
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            {/* Fuel type badge */}
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.85rem', fontWeight: '700', color: 'var(--color-primary)',
              flexShrink: 0,
            }}>
              {fuelLabel[result.fuelType] ?? result.fuelType}
            </div>

            {/* Price + station info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-primary)' }}>
                  €{result.price.toFixed(3)}
                </span>
                <span style={{
                  fontSize: '0.75rem', fontWeight: '600',
                  color: result.isFresh ? 'var(--color-fresh)' : 'var(--color-warning)',
                }}>
                  {result.isFresh ? '● värske' : '● vana'}
                </span>
              </div>
              <div style={{ fontSize: '0.88rem', color: 'var(--color-text)', fontWeight: '500', marginTop: '2px' }}>
                {getStationDisplayName(result.station)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                {result.distanceKm < 1
                  ? `${Math.round(result.distanceKm * 1000)} m`
                  : `${result.distanceKm.toFixed(1)} km`}
              </div>
            </div>

            {/* Navigate button */}
            <button
              onClick={() => window.open(
                `https://www.google.com/maps/dir/?api=1&destination=${result.station.latitude},${result.station.longitude}`,
                '_blank'
              )}
              style={{
                background: 'var(--color-primary)', color: 'white',
                border: 'none', borderRadius: '12px', padding: '10px 14px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '0.85rem', fontWeight: '600', flexShrink: 0,
              }}
            >
              <Navigation size={16} />
              Mine
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
