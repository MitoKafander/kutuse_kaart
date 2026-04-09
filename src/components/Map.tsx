import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, CircleMarker, Marker } from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed, Sun, Moon } from 'lucide-react';

const ESTONIA_CENTER: [number, number] = [58.5953, 25.0136];

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
      
      // Threshold: if already zoomed in past this, respect the user's zoom
      const ZOOM_THRESHOLD = 12;
      const isAlreadyZoomedIn = currentZoom >= ZOOM_THRESHOLD;
      
      // Use pixel-based offset so it works consistently at any zoom level.
      // The drawer covers ~40% of the bottom, so we push the station up
      // by ~25% of the map height to land it in the visible upper area.
      const mapHeight = map.getSize().y;
      const pixelOffset = mapHeight * 0.25;
      
      if (isAlreadyZoomedIn) {
        // Already zoomed in — just pan at current zoom, no zoom change
        const targetPoint = map.project([station.latitude, station.longitude], currentZoom);
        targetPoint.y += pixelOffset;
        const adjusted = map.unproject(targetPoint, currentZoom);
        map.panTo(adjusted, { animate: true, duration: 0.8 });
      } else {
        // Zoomed far out — zoom in to a useful level.
        // We use animate: false because Leaflet's zoom animation scales up SVG/DivIcons
        // exponentially via CSS, which creates the "giant expanding dots" glitch.
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

// Track current zoom level so we can conditionally render price labels vs dots
function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    onZoomChange(map.getZoom());
    const handler = () => onZoomChange(map.getZoom());
    map.on('zoomend', handler);
    return () => { map.off('zoomend', handler); };
  }, [map, onZoomChange]);
  return null;
}

// Create a Waze-style price label DivIcon
function createPriceIcon(price: number | null, isCheapest: boolean, isFresh: boolean, isSelected: boolean = false, isLightMap: boolean = false): L.DivIcon {
  if (price === null) {
    // No data — small dot (becomes brighter/darker when selected)
    const dotBg = isLightMap
      ? (isSelected ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.25)')
      : (isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)');
    const shadow = isSelected
      ? (isLightMap ? 'box-shadow: 0 0 8px rgba(0,0,0,0.4);' : 'box-shadow: 0 0 8px rgba(255,255,255,0.8);')
      : '';
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 10px; height: 10px; border-radius: 50%;
        background: ${dotBg};
        ${shadow}
      "></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });
  }

  const priceStr = `€${price.toFixed(3)}`;
  
  // Color scheme
  let bgColor = 'rgba(30, 34, 44, 0.92)';
  let borderColor = 'rgba(255,255,255,0.15)';
  let textColor = '#ffffff';
  let dotColor = isFresh ? '#10b981' : '#f59e0b';
  let shadow = '0 2px 8px rgba(0,0,0,0.4)';
  
  if (isCheapest) {
    bgColor = 'rgba(250, 204, 21, 0.95)';
    borderColor = 'rgba(250, 204, 21, 0.6)';
    textColor = '#1a1a2e';
    dotColor = '#1a1a2e';
    shadow = '0 2px 12px rgba(250, 204, 21, 0.4)';
  }

  if (isSelected) {
    shadow = '0 0 0 3px rgba(255,255,255,0.6), ' + shadow;
  }

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      display: inline-flex; align-items: center; gap: 5px;
      background: ${bgColor};
      border: 1px solid ${borderColor};
      border-radius: 16px;
      padding: 4px 10px 4px 6px;
      box-shadow: ${shadow};
      white-space: nowrap;
      font-family: 'Outfit', sans-serif;
      cursor: pointer;
      transform: translate(-50%, -50%);
    ">
      <div style="
        width: 8px; height: 8px; border-radius: 50%;
        background: ${dotColor};
        flex-shrink: 0;
      "></div>
      <span style="
        font-size: 12px; font-weight: 600;
        color: ${textColor}; letter-spacing: 0.2px;
      ">${priceStr}</span>
    </div>`,
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

export function Map({ 
  stations, 
  prices,
  allVotes,
  onStationSelect, 
  focusedFuelType,
  showOnlyFresh,
  highlightCheapest,
  selectedStation
}: { 
  stations: any[], 
  prices: any[],
  allVotes: any[],
  onStationSelect: (s: any) => void,
  focusedFuelType: string | null,
  showOnlyFresh: boolean,
  highlightCheapest: boolean,
  selectedStation: any | null
}) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [zoomLevel, setZoomLevel] = useState(7);
  const [mapStyle, setMapStyle] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('kyts-map-style') as 'dark' | 'light') || 'dark';
  });

  const tileUrl = mapStyle === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const toggleMapStyle = () => {
    const next = mapStyle === 'dark' ? 'light' : 'dark';
    setMapStyle(next);
    localStorage.setItem('kyts-map-style', next);
  };
  
  // Calculate the mathematically cheapest price for the focused fuel
  const cheapestPrice = useMemo(() => {
    if (!focusedFuelType) return null;

    let minPrice = Infinity;

    stations.forEach(station => {
      const recentPrice = prices
        .filter(p => p.station_id === station.id && p.fuel_type === focusedFuelType)
        .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())[0];

      if (recentPrice) {
        if (showOnlyFresh) {
          const ageHours = (new Date().getTime() - new Date(recentPrice.reported_at).getTime()) / (1000 * 60 * 60);
          if (ageHours > 24) return;
        }

        if (recentPrice.price < minPrice) {
          minPrice = recentPrice.price;
        }
      }
    });

    return minPrice === Infinity ? null : minPrice;
  }, [stations, prices, focusedFuelType, showOnlyFresh]);

  // IDs of the 5 cheapest stations for the focused fuel — shown as price pills even when zoomed out
  const topCheapestStationIds = useMemo(() => {
    if (!focusedFuelType) return new Set<string>();
    const ranked: { id: string; price: number }[] = [];
    stations.forEach(station => {
      const recentPrice = prices
        .filter(p => p.station_id === station.id && p.fuel_type === focusedFuelType)
        .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())[0];
      if (!recentPrice) return;
      if (showOnlyFresh) {
        const ageHours = (new Date().getTime() - new Date(recentPrice.reported_at).getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) return;
      }
      if (calculateVoteScore(recentPrice.id, allVotes) <= DOWNVOTE_THRESHOLD) return;
      ranked.push({ id: station.id, price: recentPrice.price });
    });
    ranked.sort((a, b) => a.price - b.price);
    return new Set(ranked.slice(0, 5).map(s => s.id));
  }, [stations, prices, focusedFuelType, showOnlyFresh, allVotes]);


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
        <ZoomTracker onZoomChange={setZoomLevel} />
        
        {stations.map(station => {
          // Find the most recent price for the focused fuel type (or any fuel)
          const relevantPrices = prices
            .filter(p => p.station_id === station.id && (focusedFuelType ? p.fuel_type === focusedFuelType : true))
            .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime());
            
          const mostRecentPrice = relevantPrices[0];
          
          let hasFuelData = true;
          let isFresh = false;
          let isCheapest = false;
          let isDisputed = false;
          
          if (!mostRecentPrice) {
            hasFuelData = false;
          } else {
            // Check if this price has been downvoted below threshold
            const voteScore = calculateVoteScore(mostRecentPrice.id, allVotes);
            if (voteScore <= DOWNVOTE_THRESHOLD) {
              isDisputed = true;
              hasFuelData = false;
            }
            
            const ageHours = (new Date().getTime() - new Date(mostRecentPrice.reported_at).getTime()) / (1000 * 60 * 60);
            
            if (showOnlyFresh && ageHours > 24) {
              hasFuelData = false;
            } else if (!isDisputed) {
              isFresh = ageHours <= 24;
            }
            
            if (cheapestPrice !== null && mostRecentPrice.price === cheapestPrice && hasFuelData) {
              isCheapest = true;
            }
          }
          
          // Force gray out if highlightCheapest is on but this station is NOT the cheapest  
          if (highlightCheapest && focusedFuelType && !isCheapest) {
            hasFuelData = false;
          }

          const isSelected = selectedStation?.id === station.id;

          // ---- WAZE MODE: price labels when zoomed in, or always for top-5 cheapest ----
          const showPill = !!focusedFuelType && (zoomLevel >= 12 || topCheapestStationIds.has(station.id));
          if (showPill) {
            const priceValue = (hasFuelData && mostRecentPrice) ? mostRecentPrice.price : null;
            const icon = createPriceIcon(priceValue, isCheapest, isFresh, isSelected, mapStyle === 'light');
            
            return (
              <Marker
                key={station.id}
                position={[station.latitude, station.longitude]}
                icon={icon}
                eventHandlers={{
                  click: () => onStationSelect(station)
                }}
              />
            );
          }

          // ---- DEFAULT MODE: Classic colored dots ----
          let markerColor = 'var(--color-warning)';
          
          if (!hasFuelData) {
            markerColor = mapStyle === 'light'
              ? (isSelected ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.25)')
              : (isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)');
          } else if (isFresh) {
            markerColor = 'var(--color-fresh)';
          }

          let radius = hasFuelData ? 6 : 5;
          let color = (!hasFuelData && isSelected)
            ? (mapStyle === 'light' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)')
            : 'transparent';
          let fillOpacity = hasFuelData ? 0.9 : (isSelected ? 1 : 0.55);
          let weight = 0;
          
          if (isCheapest) {
            markerColor = 'gold';
            radius = 12;
            color = 'white';
            fillOpacity = 1;
            weight = 2;
          }

          if (hasFuelData && isSelected && !isCheapest) {
            color = mapStyle === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)';
            weight = 3;
          }

          return (
            <CircleMarker 
              key={station.id} 
              center={[station.latitude, station.longitude]}
              radius={radius}
              pathOptions={{ fillColor: markerColor, color: color, weight: weight, fillOpacity: fillOpacity }}
              eventHandlers={{
                click: () => onStationSelect(station)
              }}
            />
          );
        })}

        <RecenterButton userLocation={userLocation} />
        <MapStyleToggle mapStyle={mapStyle} onToggle={toggleMapStyle} />
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
        border: '1px solid rgba(255,255,255,0.1)',
        cursor: 'pointer',
        color: mapStyle === 'dark' ? '#f59e0b' : '#6366f1',
        background: mapStyle === 'dark' ? 'var(--color-bg)' : 'rgba(255,255,255,0.9)',
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
        border: '1px solid rgba(255,255,255,0.1)',
        cursor: 'pointer',
        color: 'var(--color-primary)'
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (userLocation) {
          // Snap directly without animation to avoid massive SVG scaling distortion
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
