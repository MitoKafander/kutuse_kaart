import { useEffect, useRef } from 'react';

/**
 * Intercepts the mobile back button to close overlays instead of leaving the app.
 * Pushes a history entry when any overlay is open; on popstate, calls the close callback.
 */
let programmaticBack = false;

export function useBackButton(isOpen: boolean, onClose: () => void) {
  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      window.history.pushState({ overlay: true }, '');
    }
    if (!isOpen && wasOpen.current) {
      // Closed programmatically (X button, etc.) — clean up history entry
      if (window.history.state?.overlay) {
        programmaticBack = true;
        window.history.back();
      }
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePopState = () => {
      if (programmaticBack) {
        programmaticBack = false;
        return; // Ignore — this popstate was triggered by our own cleanup
      }
      onClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isOpen, onClose]);
}

export const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getStationDisplayName = (station: any) => {
  const brand = station.name;
  const city = station.amenities?.['addr:city'];
  const street = station.amenities?.['addr:street'];
  const nodeName = station.amenities?.name;

  if (city && street) return `${brand} (${city}, ${street})`;
  if (city) return `${brand} (${city})`;
  if (street) return `${brand} (${street})`;
  if (nodeName && nodeName !== brand) return `${brand} (${nodeName})`;
  return brand;
};
