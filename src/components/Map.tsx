import { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { LocateFixed, Lock } from 'lucide-react';
import { isPriceExpired, isPriceFresh, getNetPrice, hasDiscount, getCurrentPositionAsync, getBrand } from '../utils';
import type { LoyaltyDiscounts } from '../utils';

type NativeMap<K, V> = globalThis.Map<K, V>;
const NativeMap = globalThis.Map;

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
  stationId,
}: {
  fillColor: string;
  fillOpacity: number;
  visibleDiameter: number;
  strokeColor?: string;
  strokeWidth?: number;
  stationId?: string | number;
}): L.DivIcon {
  const bg = toRgba(fillColor, fillOpacity);
  const border = strokeWidth > 0 && strokeColor
    ? `border: ${strokeWidth}px solid ${strokeColor};`
    : '';
  const sid = stationId != null ? ` data-sid="${String(stationId).replace(/"/g, '')}"` : '';
  return L.divIcon({
    className: 'custom-dot',
    html: `<div${sid} style="
      width: ${DOT_HIT_SIZE}px; height: ${DOT_HIT_SIZE}px;
      display: flex; align-items: center; justify-content: center;
    "><div style="
      width: ${visibleDiameter}px; height: ${visibleDiameter}px;
      border-radius: 50%;
      background: ${bg};
      ${border}
      box-sizing: content-box;
      pointer-events: none;
    "></div></div>`,
    iconSize: [DOT_HIT_SIZE, DOT_HIT_SIZE],
    iconAnchor: [DOT_HIT_SIZE / 2, DOT_HIT_SIZE / 2],
  });
}

// Fixed-pixel location dot. Using a Marker with a divIcon instead of CircleMarker
// avoids the zoom-flicker — CircleMarker re-projects its center on every zoom
// animation frame, which made the dot jitter while the map zoomed.
const LOCATION_DOT_ICON = L.divIcon({
  className: 'user-location-dot',
  html: `<div style="
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--color-primary);
    border: 2px solid white;
    box-shadow: 0 0 0 2px rgba(59,130,246,0.35), 0 2px 6px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function LocationTracker({ position, setPosition }: { position: [number, number] | null, setPosition: (pos: [number, number]) => void }) {
  const map = useMap();

  useEffect(() => {
    const onLocationFound = (e: any) => {
      setPosition([e.latlng.lat, e.latlng.lng]);
    };

    map.on("locationfound", onLocationFound);
    map.locate({ watch: true, enableHighAccuracy: true });

    return () => {
      map.off("locationfound", onLocationFound);
      map.stopLocate();
    };
  }, [map, setPosition]);

  return position === null ? null : (
    <Marker position={position} icon={LOCATION_DOT_ICON} interactive={false} keyboard={false} />
  );
}

// Single map-level click delegate. Resolves the clicked station by reading the
// data-sid attribute embedded in each dot/pill DivIcon's HTML. Having one
// stable listener instead of hundreds of per-marker handlers eliminates the
// "needs several clicks" flakiness caused by react-leaflet re-registering
// every marker's click handler on each render.
// Imperative cluster layer. Replaces react-leaflet-cluster, which re-rendered
// its child Markers on every Map render — even with stable icons that constant
// React reconciliation churned the cluster group's internal layer state and
// made first-clicks miss. Here we own a single L.markerClusterGroup and diff
// markers by id ourselves; the group's DOM never gets recreated unless
// stations are actually added or removed.
type ClusterMarkerSpec = { id: string; lat: number; lng: number; icon: L.DivIcon };

function ClusterLayer({
  markers,
  iconCreateFunction,
}: {
  markers: ClusterMarkerSpec[];
  iconCreateFunction: (cluster: any) => L.DivIcon;
}) {
  const map = useMap();
  const groupRef = useRef<any>(null);
  const markerMapRef = useRef<NativeMap<string, L.Marker>>(new NativeMap());

  useEffect(() => {
    const group = (L as any).markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 40,
      disableClusteringAtZoom: 11,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      animate: false,
      animateAddingMarkers: false,
      removeOutsideVisibleBounds: false,
      iconCreateFunction,
    });
    map.addLayer(group);
    groupRef.current = group;
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
      markerMapRef.current.clear();
    };
  }, [map, iconCreateFunction]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const existing = markerMapRef.current;
    const incoming = new NativeMap<string, ClusterMarkerSpec>();
    for (const m of markers) incoming.set(m.id, m);

    const toRemove: L.Marker[] = [];
    for (const [id, marker] of existing) {
      if (!incoming.has(id)) {
        toRemove.push(marker);
        existing.delete(id);
      }
    }
    if (toRemove.length) group.removeLayers(toRemove);

    const toAdd: L.Marker[] = [];
    for (const spec of markers) {
      let marker = existing.get(spec.id);
      if (!marker) {
        marker = L.marker([spec.lat, spec.lng], {
          icon: spec.icon,
          bubblingMouseEvents: true,
        } as any);
        existing.set(spec.id, marker);
        toAdd.push(marker);
      } else {
        if ((marker.options as any).icon !== spec.icon) marker.setIcon(spec.icon);
      }
    }
    if (toAdd.length) group.addLayers(toAdd);
  }, [markers]);

  return null;
}

function MapClickDelegate({
  stationsByIdRef,
  onSelectRef,
  selectedRef,
}: {
  stationsByIdRef: React.MutableRefObject<NativeMap<string, any>>;
  onSelectRef: React.MutableRefObject<(s: any | null) => void>;
  selectedRef: React.MutableRefObject<any | null>;
}) {
  // Deps are refs by design — their `.current` is mutated inline each render
  // elsewhere in this file. Re-creating `handlers` would reattach the Leaflet
  // click listener and reintroduce the first-click-lost bug on hard reload.
  const handlers = useMemo(() => ({
    click: (e: L.LeafletMouseEvent) => {
      const t = e.originalEvent?.target as HTMLElement | null;
      const sidEl = t?.closest?.('[data-sid]') as HTMLElement | null;
      if (sidEl) {
        const sid = sidEl.getAttribute('data-sid');
        if (sid) {
          const station = stationsByIdRef.current.get(sid);
          if (station) { onSelectRef.current(station); return; }
        }
      }
      if (selectedRef.current) onSelectRef.current(null);
    },
  }), [stationsByIdRef, onSelectRef, selectedRef]);
  useMapEvents(handlers);
  return null;
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
function ViewportBoundsTracker({ onChange }: { onChange: (b: L.LatLngBounds, zoom: number, map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    // Force Leaflet to recompute container size after mount — without this,
    // hard reloads can leave the click→lat/lng projection off until the
    // first user interaction, so the first marker tap misses.
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 500);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChange(map.getBounds(), map.getZoom(), map), 150);
    };
    fire();
    map.on('moveend', fire);
    map.on('zoomend', fire);
    return () => {
      if (timer) clearTimeout(timer);
      clearTimeout(t1);
      clearTimeout(t2);
      map.off('moveend', fire);
      map.off('zoomend', fire);
    };
  }, [map, onChange]);
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
  stationId?: string | number,
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

  // Sized iconSize so Leaflet computes a real clickable hit area. Pills auto-size
  // their width via inline-flex, but Leaflet needs a concrete box to register clicks
  // — using [0,0] previously made the pill effectively un-clickable on desktop and
  // required multiple taps on mobile (first click hit the map, second hit the pill).
  const rowHeight = 16;
  const iconW = 96;
  const iconH = 8 + rows.length * rowHeight;
  const sid = stationId != null ? ` data-sid="${String(stationId).replace(/"/g, '')}"` : '';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div${sid} style="
      display: inline-flex; flex-direction: column; gap: 2px;
      background: ${bgColor};
      border: ${borderWidth}px solid ${borderColor};
      border-radius: 12px;
      padding: 4px 10px 4px 6px;
      box-shadow: ${shadow};
      white-space: nowrap;
      font-family: 'Outfit', sans-serif;
      cursor: pointer;
    ">${rowsHtml}</div>`,
    iconSize: [iconW, iconH],
    iconAnchor: [iconW / 2, iconH / 2],
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

// Custom cluster icon. Cache by (size, count) so MCG reuses the same DivIcon
// instance across re-renders instead of rebuilding the cluster DOM mid-click.
const clusterIconCache = new NativeMap<string, L.DivIcon>();
function createClusterIcon(cluster: any) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 30 : count < 30 ? 36 : 42;
  const key = `${size}|${count}`;
  const cached = clusterIconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
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
  clusterIconCache.set(key, icon);
  return icon;
}

const FUEL_TYPES_ALL = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];
const DEFAULT_FUELS = ["Bensiin 95", "Bensiin 98", "Diisel"];
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
  dotStyle,
  showClusters,
  loyaltyDiscounts = {},
  applyLoyalty = false,
  routePolyline = null,
  onUserLocationChange,
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
  dotStyle: 'info' | 'brand',
  showClusters: boolean,
  loyaltyDiscounts?: LoyaltyDiscounts,
  applyLoyalty?: boolean,
  routePolyline?: [number, number][] | null,
  onUserLocationChange?: (loc: { lat: number; lon: number } | null) => void,
}) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    onUserLocationChange?.(userLocation ? { lat: userLocation[0], lon: userLocation[1] } : null);
  }, [userLocation, onUserLocationChange]);

  const stationsById = useMemo(() => {
    const m: NativeMap<string, any> = new NativeMap();
    for (const s of stations) m.set(String(s.id), s);
    return m;
  }, [stations]);

  const stationsByIdRef = useRef(stationsById);
  stationsByIdRef.current = stationsById;

  const onStationSelectRef = useRef(onStationSelect);
  onStationSelectRef.current = onStationSelect;

  const selectedStationRef = useRef<any | null>(null);
  selectedStationRef.current = selectedStation;

  // Faded/fresh icons only depend on dotStyle + mapStyle. Cache per visual
  // state so Marker icon prop stays referentially stable across re-renders —
  // otherwise react-leaflet calls setIcon() which rebuilds the DOM element
  // and clicks land on air while the element is being replaced.
  const fadedIconCache = useMemo(() => new NativeMap<string, L.DivIcon>(), [dotStyle, mapStyle]);
  const freshIconCache = useMemo(() => new NativeMap<string, L.DivIcon>(), [dotStyle, mapStyle]);
  // Pills depend on actual price rows too, so we key by stationId and keep a
  // content hash on the entry — icon is rebuilt only if rows/selection/fuel
  // filter actually change, not on every map re-render.
  const pillIconCacheRef = useRef<NativeMap<string, { hash: string; icon: L.DivIcon }>>(new NativeMap());
  useEffect(() => { pillIconCacheRef.current.clear(); }, [mapStyle]);
  const [followMode, setFollowMode] = useState<'off' | 'located' | 'locked'>('off');
  const [viewportBounds, setViewportBounds] = useState<L.LatLngBounds | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(7);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  const tileUrl = mapStyle === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  // Per-fuel most-recent valid price per station (applies freshness + vote filters).
  // isFresh is carried for pill styling. null if no showable price for that fuel.
  const freshPriceByStationFuel = useMemo(() => {
    const map: NativeMap<string, NativeMap<string, { price: number; isFresh: boolean }>> = new NativeMap();
    stations.forEach(station => {
      const inner: NativeMap<string, { price: number; isFresh: boolean }> = new NativeMap();
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
  // Zoom-gated: when no fuel filter and zoomed out (<12), collapse each station's
  // rows to the single cheapest fuel so pills stay readable.
  const pillRowsByStation = useMemo(() => {
    const result: NativeMap<string, PillRow[]> = new NativeMap();
    const fuels = focusedFuelType ? [focusedFuelType] : DEFAULT_FUELS;

    fuels.forEach(ft => {
      const candidates: { stationId: string; brand: string; gross: number; net: number; isFresh: boolean; discounted: boolean }[] = [];
      stations.forEach(station => {
        if (viewportBounds && !viewportBounds.contains([station.latitude, station.longitude])) return;
        const data = freshPriceByStationFuel.get(station.id)?.get(ft);
        if (!data) return;
        const brand = getBrand(station.name);
        const net = getNetPrice(data.price, brand, loyaltyDiscounts, applyLoyalty);
        candidates.push({
          stationId: station.id,
          brand,
          gross: data.price,
          net,
          isFresh: data.isFresh,
          discounted: hasDiscount(brand, loyaltyDiscounts, applyLoyalty),
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

    // Collapse to single cheapest row when zoomed out without a fuel filter.
    if (!focusedFuelType && zoomLevel < 12) {
      result.forEach((rows, stationId) => {
        const cheapest = rows.reduce((m, r) => (r.price < m.price ? r : m), rows[0]);
        result.set(stationId, [{ ...cheapest, isCheapest: true }]);
      });
    }

    return result;
  }, [stations, freshPriceByStationFuel, focusedFuelType, viewportBounds, loyaltyDiscounts, applyLoyalty, zoomLevel]);

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

  // Pixel-level overlap collision: demote the more expensive pill of each overlapping pair to a dot.
  const visiblePillStations = useMemo(() => {
    if (!mapInstance) return pillStations;
    const PILL_W = 78;
    const rowHeight = 20;
    type P = { entry: typeof pillStations[number]; x: number; y: number; w: number; h: number; cheapestPrice: number; isFresh: boolean };
    const placed: P[] = pillStations
      .map(e => {
        const pt = mapInstance.latLngToContainerPoint([e.station.latitude, e.station.longitude]);
        const h = 12 + e.rows.length * rowHeight;
        const cheapest = e.rows.reduce((m, r) => Math.min(m, r.price), Infinity);
        const anyFresh = e.rows.some(r => r.isFresh);
        return { entry: e, x: pt.x, y: pt.y, w: PILL_W, h, cheapestPrice: cheapest, isFresh: anyFresh };
      })
      .sort((a, b) => a.cheapestPrice - b.cheapestPrice);

    const kept: P[] = [];
    const demoted = new Set<string>();
    for (const cand of placed) {
      const collides = kept.some(k =>
        Math.abs(cand.x - k.x) < (cand.w + k.w) / 2 &&
        Math.abs(cand.y - k.y) < (cand.h + k.h) / 2
      );
      if (collides) demoted.add(cand.entry.station.id);
      else kept.push(cand);
    }
    if (demoted.size === 0) return pillStations;
    const demotedStations = pillStations.filter(e => demoted.has(e.station.id));
    demotedStations.forEach(e => {
      dotStations.push({ station: e.station, isFresh: e.rows.some(r => r.isFresh), isCheapest: false, hasFuelData: true });
    });
    return pillStations.filter(e => !demoted.has(e.station.id));
  }, [pillStations, mapInstance, zoomLevel, viewportBounds]);

  const fadedDots = dotStations.filter(d => !d.hasFuelData);
  const freshDots = dotStations.filter(d => d.hasFuelData);

  const isLight = mapStyle === 'light';

  const getFadedIcon = (station: any, isSelected: boolean): L.DivIcon => {
    const fillColor = dotStyle === 'info' ? '#ffffff' : getBrandColor(getBrand(station.name));
    const key = `${fillColor}|${isSelected ? 1 : 0}|${String(station.id)}`;
    let icon = fadedIconCache.get(key);
    if (!icon) {
      const fillOpacity = isSelected ? 0.85 : (dotStyle === 'info' ? 0.6 : 0.4);
      const strokeColor = isSelected
        ? (isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)')
        : (dotStyle === 'info' ? (isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.2)') : undefined);
      const strokeWidth = isSelected ? 2 : (dotStyle === 'info' ? 1 : 0);
      icon = createDotIcon({ fillColor, fillOpacity, visibleDiameter: 12, strokeColor, strokeWidth, stationId: station.id });
      fadedIconCache.set(key, icon);
    }
    return icon;
  };

  const renderFadedDot = ({ station }: { station: any }) => {
    const isSelected = selectedStation?.id === station.id;
    return (
      <Marker
        key={station.id}
        position={[station.latitude, station.longitude]}
        icon={getFadedIcon(station, isSelected)}
        bubblingMouseEvents={true}
        interactive={true}
      />
    );
  };

  const getFreshIcon = (station: any, isSelected: boolean, isFresh: boolean, isCheapest: boolean): L.DivIcon => {
    const brandColor = getBrandColor(getBrand(station.name));
    const key = `${brandColor}|${isSelected ? 1 : 0}|${isFresh ? 1 : 0}|${isCheapest ? 1 : 0}|${String(station.id)}`;
    let icon = freshIconCache.get(key);
    if (!icon) {
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

      icon = createDotIcon({ fillColor, fillOpacity, visibleDiameter, strokeColor, strokeWidth, stationId: station.id });
      freshIconCache.set(key, icon);
    }
    return icon;
  };

  const fadedClusterMarkers = useMemo<ClusterMarkerSpec[]>(
    () => fadedDots.map(d => ({
      id: String(d.station.id),
      lat: d.station.latitude,
      lng: d.station.longitude,
      icon: getFadedIcon(d.station, selectedStation?.id === d.station.id),
    })),
    [fadedDots, selectedStation?.id, dotStyle, mapStyle]
  );

  const freshClusterMarkers = useMemo<ClusterMarkerSpec[]>(
    () => freshDots.map(d => ({
      id: String(d.station.id),
      lat: d.station.latitude,
      lng: d.station.longitude,
      icon: getFreshIcon(d.station, selectedStation?.id === d.station.id, d.isFresh, d.isCheapest),
    })),
    [freshDots, selectedStation?.id, dotStyle, mapStyle]
  );

  const renderFreshDot = ({ station, isFresh, isCheapest }: { station: any; isFresh: boolean; isCheapest: boolean }) => {
    const isSelected = selectedStation?.id === station.id;
    return (
      <Marker
        key={station.id}
        position={[station.latitude, station.longitude]}
        icon={getFreshIcon(station, isSelected, isFresh, isCheapest)}
        bubblingMouseEvents={true}
        interactive={true}
      />
    );
  };

  return (
    <div style={{ height: 'var(--app-height, 100dvh)', width: '100vw', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
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
        <ViewportBoundsTracker onChange={(b, z, m) => { setViewportBounds(b); setZoomLevel(z); setMapInstance(m); }} />

        {routePolyline && routePolyline.length > 1 && (
          <Polyline positions={routePolyline} pathOptions={{ color: '#22c55e', weight: 4, opacity: 0.75 }} />
        )}

        {/* Layer 1: Faded dots (no data / expired) */}
        {showClusters ? (
          <ClusterLayer markers={fadedClusterMarkers} iconCreateFunction={createClusterIcon} />
        ) : (
          <>{fadedDots.map(renderFadedDot)}</>
        )}

        {/* Layer 2: Fresh/active dots — vibrant */}
        {showClusters ? (
          <ClusterLayer markers={freshClusterMarkers} iconCreateFunction={createClusterIcon} />
        ) : (
          <>{freshDots.map(renderFreshDot)}</>
        )}

        {/* Layer 3: Price pills — always on top, never clustered */}
        {visiblePillStations.map(({ station, rows }) => {
          const isSelected = selectedStation?.id === station.id;
          const showFuelLabel = !focusedFuelType;
          const rowsHash = rows.map(r => `${r.fuelType},${r.price},${r.grossPrice},${r.isFresh ? 1 : 0},${r.isCheapest ? 1 : 0},${r.discounted ? 1 : 0}`).join(';');
          const pillHash = `${isSelected ? 1 : 0}|${showFuelLabel ? 1 : 0}|${rowsHash}`;
          const pillKey = String(station.id);
          let entry = pillIconCacheRef.current.get(pillKey);
          if (!entry || entry.hash !== pillHash) {
            entry = { hash: pillHash, icon: createPriceIcon(rows, isSelected, isLight, getBrand(station.name), showFuelLabel, station.id) };
            pillIconCacheRef.current.set(pillKey, entry);
          }
          const icon = entry.icon;

          return (
            <Marker
              key={station.id}
              position={[station.latitude, station.longitude]}
              icon={icon}
              zIndexOffset={1000}
              bubblingMouseEvents={true}
              interactive={true}
            />
          );
        })}

        <MapClickDelegate
          stationsByIdRef={stationsByIdRef}
          onSelectRef={onStationSelectRef}
          selectedRef={selectedStationRef}
        />

        <LocationFollower userLocation={userLocation} followMode={followMode} setFollowMode={setFollowMode} />
        <RecenterButton userLocation={userLocation} followMode={followMode} setFollowMode={setFollowMode} />
      </MapContainer>
    </div>
  );
}

function LocationFollower({
  userLocation,
  followMode,
  setFollowMode,
}: {
  userLocation: [number, number] | null;
  followMode: 'off' | 'located' | 'locked';
  setFollowMode: (m: 'off' | 'located' | 'locked') => void;
}) {
  const map = useMap();
  const programmaticRef = useRef(false);

  useEffect(() => {
    if (followMode !== 'locked' || !userLocation) return;
    programmaticRef.current = true;
    map.setView(userLocation, map.getZoom(), { animate: true });
    setTimeout(() => { programmaticRef.current = false; }, 400);
  }, [userLocation, followMode, map]);

  useEffect(() => {
    const onDrag = () => {
      if (programmaticRef.current) return;
      if (followMode === 'locked') setFollowMode('located');
    };
    map.on('dragstart', onDrag);
    return () => { map.off('dragstart', onDrag); };
  }, [map, followMode, setFollowMode]);

  return null;
}

function RecenterButton({
  userLocation,
  followMode,
  setFollowMode,
}: {
  userLocation: [number, number] | null;
  followMode: 'off' | 'located' | 'locked';
  setFollowMode: (m: 'off' | 'located' | 'locked') => void;
}) {
  const map = useMap();
  const color = followMode === 'locked' ? '#22c55e'
    : followMode === 'located' ? 'var(--color-primary)'
    : 'var(--color-text-muted)';
  return (
    <button
      className="glass-panel flex-center"
      title={followMode === 'locked' ? 'GPS lukus — vajuta uuesti vabastamiseks' : followMode === 'located' ? 'Vajuta uuesti GPS lukustamiseks' : 'Leia minu asukoht'}
      style={{
        position: 'absolute',
        bottom: 'calc(30px + env(safe-area-inset-bottom))',
        right: '20px',
        width: '50px',
        height: '50px',
        borderRadius: '25px',
        zIndex: 1000,
        border: followMode === 'locked' ? '1px solid #22c55e' : '1px solid var(--color-surface-border)',
        cursor: 'pointer',
        color,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (followMode === 'off') {
          if (userLocation) {
            map.setView(userLocation, 14, { animate: false });
            setFollowMode('located');
          } else {
            getCurrentPositionAsync()
              .then((pos) => {
                map.setView([pos.coords.latitude, pos.coords.longitude], 14, { animate: false });
                setFollowMode('located');
              })
              .catch(() => alert('Palun oota, GPS signaal alles laeb.'));
          }
        } else if (followMode === 'located') {
          setFollowMode('locked');
        } else {
          setFollowMode('off');
        }
      }}
    >
      <LocateFixed size={24} />
      {followMode === 'locked' && (
        <span style={{
          position: 'absolute', top: 4, right: 4,
          background: '#22c55e', borderRadius: '50%',
          width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white',
        }}>
          <Lock size={9} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
