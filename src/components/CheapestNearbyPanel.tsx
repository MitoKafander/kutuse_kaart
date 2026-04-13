import { useState, useEffect } from 'react';
import { X, Navigation, MapPin, Loader2 } from 'lucide-react';
import { haversineKm, getStationDisplayName, isPriceExpired, isPriceFresh, getNetPrice, hasDiscount, getCurrentPositionAsync, geolocationErrorMessage, getBrand } from '../utils';
import type { LoyaltyDiscounts, GeolocationErrorKind } from '../utils';

const FUEL_TYPES = ["Bensiin 95", "Bensiin 98", "Diisel"];
const RADIUS_OPTIONS = [5, 10, 20];

interface NearbyResult {
  fuelType: string;
  price: number;
  grossPrice: number;
  station: any;
  distanceKm: number;
  isFresh: boolean;
  outsideRadius: boolean;
  discounted: boolean;
}

function findCheapestNearby(
  stations: any[],
  prices: any[],
  allVotes: any[],
  userLat: number,
  userLon: number,
  radiusKm: number,
  preferredBrands: string[] = [],
  loyaltyDiscounts: LoyaltyDiscounts = {},
  applyLoyalty: boolean = false,
): NearbyResult[] {
  const results: NearbyResult[] = [];

  for (const fuelType of FUEL_TYPES) {
    let best: NearbyResult | null = null;
    let bestOutside: NearbyResult | null = null;

    for (const station of stations) {
      const brand = getBrand(station.name);
      if (preferredBrands.length > 0 && !preferredBrands.includes(brand)) continue;
      const dist = haversineKm(userLat, userLon, station.latitude, station.longitude);

      const recentPrice = prices
        .filter(p => p.station_id === station.id && p.fuel_type === fuelType)
        .sort((a: any, b: any) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())[0];

      if (!recentPrice) continue;
      if (isPriceExpired(recentPrice, allVotes)) continue;

      const net = getNetPrice(recentPrice.price, brand, loyaltyDiscounts, applyLoyalty);
      const candidate: NearbyResult = {
        fuelType,
        price: net,
        grossPrice: recentPrice.price,
        station,
        distanceKm: dist,
        isFresh: isPriceFresh(recentPrice, allVotes),
        outsideRadius: dist > radiusKm,
        discounted: hasDiscount(brand, loyaltyDiscounts, applyLoyalty),
      };

      if (dist <= radiusKm) {
        if (!best || candidate.price < best.price) best = candidate;
      } else {
        // Fallback: closest-outside-radius cheapest, only used if nothing within
        if (!bestOutside || candidate.distanceKm < bestOutside.distanceKm ||
            (candidate.distanceKm === bestOutside.distanceKm && candidate.price < bestOutside.price)) {
          bestOutside = candidate;
        }
      }
    }

    if (best) results.push(best);
    else if (bestOutside) results.push(bestOutside);
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
  loyaltyDiscounts = {},
  applyLoyalty = false,
  onStationSelect,
  fallbackLocation = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  stations: any[];
  prices: any[];
  allVotes: any[];
  radius: number;
  onRadiusChange: (r: number) => void;
  preferredBrands?: string[];
  loyaltyDiscounts?: LoyaltyDiscounts;
  applyLoyalty?: boolean;
  onStationSelect?: (station: any) => void;
  fallbackLocation?: { lat: number; lon: number } | null;
}) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationErrorKind, setLocationErrorKind] = useState<GeolocationErrorKind | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const requestLocation = () => {
    setIsLocating(true);
    setLocationErrorKind(null);
    getCurrentPositionAsync()
      .then(pos => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      })
      .catch((e: any) => {
        if (fallbackLocation) {
          setUserLocation(fallbackLocation);
          setLocationErrorKind(null);
        } else {
          setLocationErrorKind((e?.kind as GeolocationErrorKind) || 'unavailable');
        }
      })
      .finally(() => setIsLocating(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    setLocationErrorKind(null);
    if (userLocation || fallbackLocation) {
      if (!userLocation && fallbackLocation) setUserLocation(fallbackLocation);
      getCurrentPositionAsync({ enableHighAccuracy: true, maximumAge: 120000, timeout: 15000 })
        .then(pos => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }))
        .catch(() => {});
      return;
    }
    requestLocation();
  }, [isOpen]);

  if (!isOpen) return null;

  const results = userLocation
    ? findCheapestNearby(stations, prices, allVotes, userLocation.lat, userLocation.lon, radius, preferredBrands, loyaltyDiscounts, applyLoyalty)
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

        {locationErrorKind && !isLocating && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)', padding: '14px 16px',
            fontSize: '0.9rem', color: 'var(--color-text)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <span>{geolocationErrorMessage(locationErrorKind)}</span>
            <button onClick={requestLocation} style={{
              background: 'var(--color-primary)', color: 'white', border: 'none',
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 600, flexShrink: 0,
            }}>Proovi uuesti</button>
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
            onClick={() => {
              if (onStationSelect) { onStationSelect(result.station); onClose(); }
            }}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              cursor: onStationSelect ? 'pointer' : 'default',
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--color-primary)' }}>
                  €{result.price.toFixed(3)}
                </span>
                {result.discounted && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>
                    €{result.grossPrice.toFixed(3)}
                  </span>
                )}
                {result.discounted && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b' }}>★ sooduskaart</span>
                )}
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
              <div style={{ fontSize: '0.78rem', color: result.outsideRadius ? 'var(--color-warning)' : 'var(--color-text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{result.distanceKm < 1
                  ? `${Math.round(result.distanceKm * 1000)} m`
                  : `${result.distanceKm.toFixed(1)} km`}</span>
                {result.outsideRadius && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>• väljaspool raadiust</span>
                )}
              </div>
            </div>

            {/* Navigate button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${result.station.latitude},${result.station.longitude}`,
                  '_blank'
                );
              }}
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
