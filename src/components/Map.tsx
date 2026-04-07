import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, CircleMarker } from 'react-leaflet';
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
      // By subtracting a tiny amount from the latitude, the camera centers slightly
      // south of the actual station. This effectively forces the station's marker
      // to render in the top half of the screen, perfectly avoiding the bottom Drawer!
      const latOffset = 0.008;
      
      map.flyTo([station.latitude - latOffset, station.longitude], 14, {
        animate: true,
        duration: 1.5,
      });
    }
  }, [station, map]);
  return null;
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
    if (!highlightCheapest || !focusedFuelType) return null;
    
    let minPrice = Infinity;
    
    // Scan all stations currently allowed on map
    stations.forEach(station => {
      // Find the most recent price for this fuel at this station
      const recentPrice = prices
        .filter(p => p.station_id === station.id && p.fuel_type === focusedFuelType)
        .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())[0];
        
      if (recentPrice) {
        // If we are filtering by fresh, ignore stale prices in our math
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
  }, [stations, prices, focusedFuelType, highlightCheapest, showOnlyFresh]);


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
          let hasFuelData = true;
          let markerColor = 'var(--color-warning)'; // Default yellow
          let isCheapest = false;

          // Find the most recent price for ALL fuels (if no focused type) OR just the focused fuel
          const relevantPrices = prices
            .filter(p => p.station_id === station.id && (focusedFuelType ? p.fuel_type === focusedFuelType : true))
            .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime());
            
          const mostRecentPrice = relevantPrices[0];

          if (!mostRecentPrice) {
            // No data whatsoever for the requirements
            markerColor = 'rgba(255,255,255,0.2)'; 
            hasFuelData = false;
          } else {
            // Data exists. Check freshness.
            const ageHours = (new Date().getTime() - new Date(mostRecentPrice.reported_at).getTime()) / (1000 * 60 * 60);
            
            if (showOnlyFresh && ageHours > 24) {
              markerColor = 'rgba(255,255,255,0.1)'; 
              hasFuelData = false;
            } else if (ageHours <= 24) {
              markerColor = 'var(--color-fresh)'; 
            }
            
            // Check if it is the absolute cheapest
            if (highlightCheapest && cheapestPrice !== null && mostRecentPrice.price === cheapestPrice && hasFuelData) {
              isCheapest = true;
            }
          }

          // Force gray out if highlightCheapest is on but this station is NOT the cheapest
          if (highlightCheapest && focusedFuelType && !isCheapest) {
            markerColor = 'rgba(255,255,255,0.1)';
            hasFuelData = false;
          }

          let radius = hasFuelData ? 6 : 4;
          let color = 'transparent';
          let fillOpacity = hasFuelData ? 0.9 : 0.4;
          
          if (isCheapest) {
            markerColor = 'gold';
            radius = 12; // Massive dot
            color = 'white'; // White border to make it pop
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
          // Instantly fly to the tracked location
          map.flyTo(userLocation, 14, { animate: true, duration: 1.5 });
        } else {
          // Fallback if not tracked yet, do NOT use map.locate() as it breaks watch options!
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
