import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, CircleMarker, Marker, Polyline } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { LocateFixed, Sun, Moon } from 'lucide-react';
import { isPriceExpired, isPriceFresh, getNetPrice, hasDiscount, LoyaltyDiscounts } from '../utils';

const ESTONIA_CENTER: [number, number] = [58.5953, 25.0136];

const BRAND_COLORS: Record<string, string> = {
  'Circle K':  '#e31937',
  'Neste':     '#009639',
  'Olerex':    '#f7941d',
  'Alexela':   '#0072ce',
  'Terminal':  '#8b5cf6',
};

function getBrandColor(name: string): string {
  return BRAND_COLORS[name] || '#6b7280';
}

function toRgba(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

// Create a tappable dot with a transparent hit area larger than the visible dot.
// This makes dots much easier to tap on phones without making them visually bigger.
const DOT_HIT_SIZE = 36;
function createDotIcon({
  fillColor,
  fillOpacity,
  visibleDiameter,
  strokeColor,
  strokeWidth = 0,
}: {
  fillColor: string;
  fillOpacity: number;
  visibleDiameter: number;
  strokeColor?: string;
  strokeWidth?: number;
}): L.DivIcon {
  const bg = toRgba(fillColor, fillOpacity);
  const border = strokeWidth > 0 && strokeColor
    ? `border: ${strokeWidth}px solid ${strokeColor};`
    : '';
  return L.divIcon({
    className: 'custom-dot',
    html: `<div style="
      width: ${DOT_HIT_SIZE}px; height: ${DOT_HIT_SIZE}px;
      display: flex; align-items: center; justify-content: center;
    "><div style="
      width: ${visibleDiameter}px; height: ${visibleDiameter}px;
      border-radius: 50%;
      background: ${bg};
      ${border}
      box-sizing: content-box;
    "></div></div>`,
    iconSize: [DOT_HIT_SIZE, DOT_HIT_SIZE],
    iconAnchor: [DOT_HIT_SIZE / 2, DOT_HIT_SIZE / 2],
  });
}

function LocationTracker({ position, setPosition }: { position: [number, number] | null, setPosition: (pos: [number, number]) => void }) {
  const map = useMap();

  useEffect(() => {
    const onLocationFound = (e: any) => {
      setPosition([e.latlng.lat, e.latlng.lng]);
    };

    map.on("locationfound", onLocationFound);

    // Start watching the GPS constantly for instant reactions
    map.locate({ watch: true, enableHighAccuracy: true });

    return () => {
      map.off("locationfound", onLocationFound);
      map.stopLocate();
    };
  }, [map, setPosition]);

  return position === null ? null : (
    <CircleMarker center={position} radius={8} pathOptions={{ fillColor: 'var(--color-primary)', color: 'white', weight: 2, fillOpacity: 1 }} />
  );
}

function StationPanController({ station, hasPriceLabels }: { station: any | null, hasPriceLabels: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (station && station.latitude && station.longitude) {
      const currentZoom = map.getZoom();

      const ZOOM_THRESHOLD = 12;
      const isAlreadyZoomedIn = currentZoom >= ZOOM_THRESHOLD;

      const mapHeight = map.getSize().y;
      const pixelOffset = mapHeight * 0.25;

      if (isAlreadyZoomedIn) {
        const targetPoint = map.project([station.latitude, station.longitude], currentZoom);
        targetPoint.y += pixelOffset;
        const adjusted = map.unproject(targetPoint, currentZoom);
        map.panTo(adjusted, { animate: true, duration: 0.8 });
      } else {
        const targetZoom = hasPriceLabels ? 15 : 14;
        const targetPoint = map.project([station.latitude, station.longitude], targetZoom);
        targetPoint.y += pixelOffset;
        const adjusted = map.unproject(targetPoint, targetZoom);
        map.setView(adjusted, targetZoom, { animate: false });
      }
    }
  }, [station, map, hasPriceLabels]);
  return null;
}

// Tracks the current viewport bounds so top-N pills are recomputed only for
// stations visible on screen. Debounced to avoid thrashing during pans.
function ViewportBoundsTracker({ onBoundsChange }: { onBoundsChange: (b: L.LatLngBounds) => void }) {
  const map = useMap();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onBoundsChange(map.getBounds()), 150);
    };
    fire();
    map.on('moveend', fire);
    map.on('zoomend', fire);
    return () => {
      if (timer) clearTimeout(timer);
      map.off('moveend', fire);
      map.off('zoomend', fire);
    };
  }, [map, onBoundsChange]);
  return null;
}

const FUEL_SHORT: Record<string, string> = {
  'Bensiin 95': '95', 'Bensiin 98': '98', 'Diisel': 'D', 'LPG': 'LPG',
};

interface PillRow { fuelType: string; price: number; grossPrice: number; isFresh: boolean; isCheapest: boolean; discounted: boolean; }

// Create a Waze-style price label DivIcon. Supports multi-row content
// (one row per fuel type) so a station that ranks in top-N for multiple
// fuels shows all of them stacked in a single pill.
function createPriceIcon(
  rows: PillRow[],
  isSelected: boolean,
  isLightMap: boolean,
  brandName: string,
  showFuelLabel: boolean,
): L.DivIcon {
  const brandColor = getBrandColor(brandName);
  const anyCheapest = rows.some(r => r.isCheapest);

  let bgColor = isLightMap ? 'rgba(255, 255, 255, 0.92)' : 'rgba(30, 34, 44, 0.92)';
  let borderColor = isLightMap ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)';
  const textColor = isLightMap ? '#1a1d24' : '#ffffff';
  let shadow = '0 2px 8px rgba(0,0,0,0.4)';

  if (anyCheapest) {
    bgColor = 'rgba(250, 204, 21, 0.95)';
    borderColor = 'rgba(250, 204, 21, 0.6)';
    shadow = '0 2px 12px rgba(250, 204, 21, 0.4)';
  }

  const anyStale = rows.some(r => !r.isFresh);
  if (anyStale && !anyCheapest) {
    borderColor = 'rgba(245, 158, 11, 0.55)';
  }
  const borderWidth = anyStale ? 1.5 : 1;

  if (isSelected) {
    const ringColor = isLightMap ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)';
    shadow = `0 0 0 3px ${ringColor}, ` + shadow;
  }

  const rowsHtml = rows.map(r => {
    const priceStr = `€${r.price.toFixed(3)}`;
    const rowColor = anyCheapest ? '#1a1a2e' : textColor;
    const fuelBadge = showFuelLabel
      ? `<span style="font-size:10px;font-weight:700;opacity:0.7;margin-right:4px;min-width:18px;">${FUEL_SHORT[r.fuelType] ?? r.fuelType}</span>`
      : '';
    const grossStrike = r.discounted
      ? `<span style="font-size:10px;font-weight:500;color:${rowColor};opacity:0.55;text-decoration:line-through;margin-left:3px;">€${r.grossPrice.toFixed(3)}</span>`
      : '';
    const cardBadge = r.discounted
      ? `<span style="font-size:9px;font-weight:700;color:${anyCheapest ? '#1a1a2e' : '#f59e0b'};margin-left:2px;">★</span>`
      : '';
    return `<div style="display:flex;align-items:center;gap:5px;opacity:${r.isFresh ? 1 : 0.55};line-height:1.1;">
      <div style="width:6px;height:6px;border-radius:50%;background:${brandColor};flex-shrink:0;"></div>
      ${fuelBadge}
      <span style="font-size:12px;font-weight:600;color:${rowColor};letter-spacing:0.2px;">${priceStr}</span>
      ${cardBadge}${grossStrike}
    </div>`;
  }).join('');

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      display: inline-flex; flex-direction: column; gap: 2px;
      background: ${bgColor};
      border: ${borderWidth}px solid ${borderColor};
      border-radius: 12px;
      padding: 4px 10px 4px 6px;
      box-shadow: ${shadow};
      white-space: nowrap;
      font-family: 'Outfit', sans-serif;
      cursor: pointer;
      transform: translate(-50%, -50%);
    ">${rowsHtml}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

const DOWNVOTE_THRESHOLD = -3;

function calculateVoteScore(priceId: string, allVotes: any[]): number {
  let score = 0;
  allVotes.forEach(v => {
    if (v.price_id === priceId) {
      if (v.vote_type === 'up') score += 1;
      if (v.vote_type === 'down') score -= 1;
    }
  });
  return score;
}

// Custom cluster icon
function createClusterIcon(cluster: any) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 30 : count < 30 ? 36 : 42;
  return L.divIcon({
    html: `<div style="
      width: ${size}px; height: ${size}px; border-radius: 50%;
      background: rgba(59, 130, 246, 0.7);
      border: 2px solid rgba(59, 130, 246, 0.9);
      color: #fff; font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Outfit', sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">${count}</div>`,
    className: 'custom-cluster',
    iconSize: L.point(size, size),
    iconAnchor: L.point(size / 2, size / 2),
  });
}

const FUEL_TYPES_ALL = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];
const TOP_N_PER_FUEL = 3;

export function Map({
  stations,
  prices,
  allVotes,
  onStationSelect,
  focusedFuelType,
  showOnlyFresh,
  highlightCheapest,
  showStaleDemo = false,
  selectedStation,
  mapStyle,
  onToggleMapStyle,
  dotStyle,
  showClusters,
  loyaltyDiscounts = {},
  applyLoyalty = false,
  routePolyline = null,
}: {
  stations: any[],
  prices: any[],
  allVotes: any[],
  onStationSelect: (s: any) => void,
  focusedFuelType: string | null,
  showOnlyFresh: boolean,
  highlightCheapest: boolean,
  showStaleDemo?: boolean,
  selectedStation: any | null,
  mapStyle: 'dark' | 'light',
  onToggleMapStyle: () => void,
  dotStyle: 'info' | 'brand',
  showClusters: boolean,
  loyaltyDiscounts?: LoyaltyDiscounts,
  applyLoyalty?: boolean,
  routePolyline?: [number, number][] | null,
}) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [viewportBounds, setViewportBounds] = useState<L.LatLngBounds | null>(null);

  const tileUrl = mapStyle === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  // Per-fuel most-recent valid price per station (applies freshness + vote filters).
  // isFresh is carried for pill styling. null if no showable price for that fuel.
  const freshPriceByStationFuel = useMemo(() => {
    const map = new Map<string, Map<string, { price: number; isFresh: boolean }>>();
    stations.forEach(station => {
      const inner = new Map<string, { price: number; isFresh: boolean }>();
      FUEL_TYPES_ALL.forEach(ft => {
        const recent = prices
          .filter(p => p.station_id === station.id && p.fuel_type === ft)
          .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())[0];
        if (!recent) return;
        if (calculateVoteScore(recent.id, allVotes) <= DOWNVOTE_THRESHOLD) return;
        const expired = isPriceExpired(recent, allVotes);
        if (expired && !showStaleDemo) return;
        if (showOnlyFresh && !isPriceFresh(recent, allVotes)) return;
        inner.set(ft, { price: recent.price, isFresh: isPriceFresh(recent, allVotes) });
      });
      if (inner.size > 0) map.set(station.id, inner);
    });
    return map;
  }, [stations, prices, allVotes, showOnlyFresh, showStaleDemo]);

  // Top-N cheapest stations per fuel type within the current viewport bounds.
  // Returns a map: stationId -> PillRow[] (one row per fuel type it ranks in).
  const pillRowsByStation = useMemo(() => {
    const result = new Map<string, PillRow[]>();
    const fuels = focusedFuelType ? [focusedFuelType] : FUEL_TYPES_ALL;

    fuels.forEach(ft => {
      const candidates: { stationId: string; brand: string; gross: number; net: number; isFresh: boolean; discounted: boolean }[] = [];
      stations.forEach(station => {
        if (viewportBounds && !viewportBounds.contains([station.latitude, station.longitude])) return;
        const data = freshPriceByStationFuel.get(station.id)?.get(ft);
        if (!data) return;
        const net = getNetPrice(data.price, station.name, loyaltyDiscounts, applyLoyalty);
        candidates.push({
          stationId: station.id,
          brand: station.name,
          gross: data.price,
          net,
          isFresh: data.isFresh,
          discounted: hasDiscount(station.name, loyaltyDiscounts, applyLoyalty),
        });
      });
      candidates.sort((a, b) => a.net - b.net);
      const topN = candidates.slice(0, TOP_N_PER_FUEL);
      topN.forEach((c, i) => {
        const rows = result.get(c.stationId) || [];
        rows.push({
          fuelType: ft,
          price: c.net,
          grossPrice: c.gross,
          isFresh: c.isFresh,
          isCheapest: i === 0,
          discounted: c.discounted,
        });
        result.set(c.stationId, rows);
      });
    });

    return result;
  }, [stations, freshPriceByStationFuel, focusedFuelType, viewportBounds, loyaltyDiscounts, applyLoyalty]);

  // Split markers: stations that earned pill rows get pills; others get dots.
  // `highlightCheapest` (when focused fuel): keep only the single cheapest station.
  const pillStations: { station: any; rows: PillRow[] }[] = [];
  const dotStations: { station: any; isFresh: boolean; isCheapest: boolean; hasFuelData: boolean }[] = [];

  stations.forEach(station => {
    const rows = pillRowsByStation.get(station.id);
    if (rows && rows.length > 0) {
      if (highlightCheapest && focusedFuelType && !rows[0].isCheapest) {
        // hide non-cheapest in highlight mode
        return;
      }
      pillStations.push({ station, rows });
      return;
    }
    if (highlightCheapest && focusedFuelType) return;
    // Determine dot freshness based on most relevant fuel data (for brand/info styling)
    const fuelMap = freshPriceByStationFuel.get(station.id);
    const hasFuelData = !!fuelMap && fuelMap.size > 0;
    let isFresh = false;
    if (hasFuelData && focusedFuelType) {
      const d = fuelMap!.get(focusedFuelType);
      if (d) isFresh = d.isFresh;
    } else if (hasFuelData) {
      isFresh = Array.from(fuelMap!.values()).some(v => v.isFresh);
    }
    dotStations.push({ station, isFresh, isCheapest: false, hasFuelData });
  });

  const fadedDots = dotStations.filter(d => !d.hasFuelData);
  const freshDots = dotStations.filter(d => d.hasFuelData);

  const isLight = mapStyle === 'light';

  const renderFadedDot = ({ station }: { station: any }) => {
    const isSelected = selectedStation?.id === station.id;
    const fillColor = dotStyle === 'info' ? '#6b7280' : getBrandColor(station.name);
    const fillOpacity = isSelected ? 0.6 : (dotStyle === 'info' ? 0.25 : 0.35);
    const strokeColor = isSelected
      ? (isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)')
      : undefined;
    const strokeWidth = isSelected ? 2 : 0;

    return (
      <Marker
        key={station.id}
        position={[station.latitude, station.longitude]}
        icon={createDotIcon({ fillColor, fillOpacity, visibleDiameter: 10, strokeColor, strokeWidth })}
        eventHandlers={{ click: () => onStationSelect(station) }}
      />
    );
  };

  const renderFreshDot = ({ station, isFresh, isCheapest }: { station: any; isFresh: boolean; isCheapest: boolean }) => {
    const isSelected = selectedStation?.id === station.id;
    const brandColor = getBrandColor(station.name);

    let visibleDiameter = 12;
    let fillColor = brandColor;
    let fillOpacity = isFresh ? 0.9 : 0.55;
    let strokeColor: string | undefined;
    let strokeWidth = 0;

    if (isCheapest) {
      fillColor = '#facc15';
      visibleDiameter = 22;
      fillOpacity = 1;
      strokeColor = isLight ? '#333' : '#ffffff';
      strokeWidth = 2;
    }

    if (isSelected && !isCheapest) {
      strokeColor = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)';
      strokeWidth = 3;
    }

    return (
      <Marker
        key={station.id}
        position={[station.latitude, station.longitude]}
        icon={createDotIcon({ fillColor, fillOpacity, visibleDiameter, strokeColor, strokeWidth })}
        eventHandlers={{ click: () => onStationSelect(station) }}
      />
    );
  };

  return (
    <div style={{ height: '100dvh', width: '100vw', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
      <MapContainer
        center={ESTONIA_CENTER}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          key={mapStyle}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={tileUrl}
        />
        <LocationTracker position={userLocation} setPosition={setUserLocation} />
        <StationPanController station={selectedStation} hasPriceLabels={!!focusedFuelType} />
        <ViewportBoundsTracker onBoundsChange={setViewportBounds} />

        {routePolyline && routePolyline.length > 1 && (
          <Polyline positions={routePolyline} pathOptions={{ color: '#22c55e', weight: 4, opacity: 0.75 }} />
        )}

        {/* Layer 1: Faded dots (no data / expired) */}
        {showClusters ? (
          <MarkerClusterGroup
            key="faded-clustered"
            chunkedLoading
            maxClusterRadius={40}
            disableClusteringAtZoom={11}
            spiderfyOnMaxZoom={false}
            showCoverageOnHover={false}
            iconCreateFunction={createClusterIcon}
          >
            {fadedDots.map(renderFadedDot)}
          </MarkerClusterGroup>
        ) : (
          <>{fadedDots.map(renderFadedDot)}</>
        )}

        {/* Layer 2: Fresh/active dots — vibrant */}
        {showClusters ? (
          <MarkerClusterGroup
            key="fresh-clustered"
            chunkedLoading
            maxClusterRadius={40}
            disableClusteringAtZoom={11}
            spiderfyOnMaxZoom={false}
            showCoverageOnHover={false}
            iconCreateFunction={createClusterIcon}
          >
            {freshDots.map(renderFreshDot)}
          </MarkerClusterGroup>
        ) : (
          <>{freshDots.map(renderFreshDot)}</>
        )}

        {/* Layer 3: Price pills — always on top, never clustered */}
        {pillStations.map(({ station, rows }) => {
          const isSelected = selectedStation?.id === station.id;
          const icon = createPriceIcon(rows, isSelected, isLight, station.name, !focusedFuelType);

          return (
            <Marker
              key={station.id}
              position={[station.latitude, station.longitude]}
              icon={icon}
              eventHandlers={{ click: () => onStationSelect(station) }}
            />
          );
        })}

        <RecenterButton userLocation={userLocation} />
        <MapStyleToggle mapStyle={mapStyle} onToggle={onToggleMapStyle} />
      </MapContainer>
    </div>
  );
}

function MapStyleToggle({ mapStyle, onToggle }: { mapStyle: 'dark' | 'light', onToggle: () => void }) {
  return (
    <button
      className="glass-panel flex-center"
      style={{
        position: 'absolute',
        bottom: 'calc(90px + env(safe-area-inset-bottom))',
        right: '20px',
        width: '50px',
        height: '50px',
        borderRadius: '25px',
        zIndex: 1000,
        border: '1px solid var(--color-surface-border)',
        cursor: 'pointer',
        color: mapStyle === 'dark' ? '#f59e0b' : '#6366f1',
        background: 'var(--color-bg)',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={mapStyle === 'dark' ? 'Hele kaart' : 'Tume kaart'}
    >
      {mapStyle === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
    </button>
  );
}

function RecenterButton({ userLocation }: { userLocation: [number, number] | null }) {
  const map = useMap();
  return (
    <button
      className="glass-panel flex-center"
      style={{
        position: 'absolute',
        bottom: 'calc(30px + env(safe-area-inset-bottom))',
        right: '20px',
        width: '50px',
        height: '50px',
        borderRadius: '25px',
        zIndex: 1000,
        border: '1px solid var(--color-surface-border)',
        cursor: 'pointer',
        color: 'var(--color-primary)'
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (userLocation) {
          map.setView(userLocation, 14, { animate: false });
        } else {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 14, { animate: false }),
              () => alert("Palun oota, GPS signaal alles laeb.")
            );
          }
        }
      }}
    >
      <LocateFixed size={24} />
    </button>
  );
}
