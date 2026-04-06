import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, CircleMarker } from 'react-leaflet';
import { Navigation } from 'lucide-react';

const ESTONIA_CENTER: [number, number] = [58.5953, 25.0136];

function LocationMarker() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const map = useMap();

  useEffect(() => {
    map.locate().on("locationfound", function (e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
      map.flyTo(e.latlng, 10);
    });
  }, [map]);

  return position === null ? null : (
    <CircleMarker center={position} radius={8} pathOptions={{ fillColor: 'var(--color-primary)', color: 'white', weight: 2, fillOpacity: 1 }} />
  );
}

export function Map({ 
  stations, 
  prices,
  onStationSelect, 
  focusedFuelType 
}: { 
  stations: any[], 
  prices: any[],
  onStationSelect: (s: any) => void,
  focusedFuelType: string | null 
}) {
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
        <LocationMarker />
        
        {stations.map(station => {
          let hasFuelData = true;
          let markerColor = 'var(--color-warning)'; // Default yellow

          // If a specific fuel type is selected, check if this station has any price for it
          if (focusedFuelType) {
            const hasSpecificFuel = prices.some(p => p.station_id === station.id && p.fuel_type === focusedFuelType);
            if (!hasSpecificFuel) {
              markerColor = 'rgba(255,255,255,0.2)'; // Gray out missing data
              hasFuelData = false;
            } else {
              markerColor = 'var(--color-fresh)'; // Highlight active hits
            }
          } else {
            // No filter active, if no prices at all -> gray
            const hasAnyPrices = prices.some(p => p.station_id === station.id);
            if (!hasAnyPrices) markerColor = 'rgba(255,255,255,0.2)';
          }

          return (
            <CircleMarker 
              key={station.id} 
              center={[station.latitude, station.longitude]}
              radius={hasFuelData ? 6 : 4} // Smaller if no data matches
              pathOptions={{ fillColor: markerColor, color: 'transparent', fillOpacity: hasFuelData ? 0.9 : 0.4 }}
              eventHandlers={{
                click: () => onStationSelect(station)
              }}
            />
          );
        })}

        <RecenterButton />
      </MapContainer>
    </div>
  );
}

function RecenterButton() {
  const map = useMap();
  return (
    <button 
      className="glass-panel flex-center"
      style={{
        position: 'absolute',
        bottom: '20vh',
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
        map.locate();
      }}
    >
      <Navigation size={24} />
    </button>
  );
}
