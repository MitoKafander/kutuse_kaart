import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, CircleMarker, Marker } from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed } from 'lucide-react';

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

function StationPanController({ station }: { station: any | null }) {
  const map = useMap();
  useEffect(() => {
    if (station && station.latitude && station.longitude) {
      const latOffset = 0.008;
      
      map.flyTo([station.latitude - latOffset, station.longitude], 14, {
        animate: true,
        duration: 1.5,
      });
    }
  }, [station, map]);
  return null;
}

// Create a Waze-style price label DivIcon
function createPriceIcon(price: number | null, isCheapest: boolean, isFresh: boolean): L.DivIcon {
  if (price === null) {
    // No data — small gray dot
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 10px; height: 10px; border-radius: 50%;
        background: rgba(255,255,255,0.15);
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

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      display: flex; align-items: center; gap: 5px;
      background: ${bgColor};
      border: 1px solid ${borderColor};
      border-radius: 16px;
      padding: 4px 10px 4px 6px;
      box-shadow: ${shadow};
      white-space: nowrap;
      font-family: 'Outfit', sans-serif;
      cursor: pointer;
      transition: transform 0.15s ease;
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
    iconSize: [90, 28],
    iconAnchor: [45, 14],
  });
}

export function Map({ 
  stations, 
  prices,
  onStationSelect, 
  focusedFuelType,
  showOnlyFresh,
  highlightCheapest,
  selectedStation
}: { 
  stations: any[], 
  prices: any[],
  onStationSelect: (s: any) => void,
  focusedFuelType: string | null,
  showOnlyFresh: boolean,
  highlightCheapest: boolean,
  selectedStation: any | null
}) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  
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


  return (
    <div style={{ height: '100dvh', width: '100vw', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
      <MapContainer 
        center={ESTONIA_CENTER} 
        zoom={7} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <LocationTracker position={userLocation} setPosition={setUserLocation} />
        <StationPanController station={selectedStation} />
        
        {stations.map(station => {
          // Find the most recent price for the focused fuel type (or any fuel)
          const relevantPrices = prices
            .filter(p => p.station_id === station.id && (focusedFuelType ? p.fuel_type === focusedFuelType : true))
            .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime());
            
          const mostRecentPrice = relevantPrices[0];
          
          let hasFuelData = true;
          let isFresh = false;
          let isCheapest = false;
          
          if (!mostRecentPrice) {
            hasFuelData = false;
          } else {
            const ageHours = (new Date().getTime() - new Date(mostRecentPrice.reported_at).getTime()) / (1000 * 60 * 60);
            
            if (showOnlyFresh && ageHours > 24) {
              hasFuelData = false;
            } else {
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

          // ---- WAZE MODE: Use price label markers when a fuel type is focused ----
          if (focusedFuelType) {
            const priceValue = (hasFuelData && mostRecentPrice) ? mostRecentPrice.price : null;
            const icon = createPriceIcon(priceValue, isCheapest, isFresh);
            
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
            markerColor = 'rgba(255,255,255,0.2)';
          } else if (isFresh) {
            markerColor = 'var(--color-fresh)';
          }

          let radius = hasFuelData ? 6 : 4;
          let color = 'transparent';
          let fillOpacity = hasFuelData ? 0.9 : 0.4;
          
          if (isCheapest) {
            markerColor = 'gold';
            radius = 12;
            color = 'white';
            fillOpacity = 1;
          }

          return (
            <CircleMarker 
              key={station.id} 
              center={[station.latitude, station.longitude]}
              radius={radius}
              pathOptions={{ fillColor: markerColor, color: color, weight: isCheapest ? 2 : 0, fillOpacity: fillOpacity }}
              eventHandlers={{
                click: () => onStationSelect(station)
              }}
            />
          );
        })}

        <RecenterButton userLocation={userLocation} />
      </MapContainer>
    </div>
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
          map.flyTo(userLocation, 14, { animate: true, duration: 1.5 });
        } else {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => map.flyTo([pos.coords.latitude, pos.coords.longitude], 14, { animate: true, duration: 1.5 }),
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
