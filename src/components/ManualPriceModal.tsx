import { useState, useRef, useEffect } from 'react';
import { X, Check, Camera, Loader2, AlertTriangle, RefreshCw, MapPin, Upload, ArrowLeft } from 'lucide-react';
import { supabase } from '../supabase';
import { getStationDisplayName, haversineKm, getCurrentPositionAsync, geolocationErrorMessage } from '../utils';
import { capture } from '../utils/analytics';
import * as Sentry from '@sentry/react';

const FUEL_TYPES = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];
const MAX_RETRIES = 2;
const EMPTY_PRICES = { "Bensiin 95": "", "Bensiin 98": "", "Diisel": "", "LPG": "" };
// Hard cap on how far a submitter may be from the station they're reporting
// for. Matches the server trigger in schema_phase31 so both client and DB
// agree — any change here needs the same value in the migration.
const MAX_SUBMIT_KM = 1;

export function ManualPriceModal({
  station,
  isOpen,
  onClose,
  onPricesSubmitted,
  allStations,
  photoExpanded,
  onPhotoExpandedChange,
  mode,
}: {
  station: any | null,
  isOpen: boolean,
  onClose: () => void,
  onPricesSubmitted: () => void,
  allStations?: any[],
  photoExpanded: boolean,
  onPhotoExpandedChange: (expanded: boolean) => void,
  mode?: 'station' | 'camera' | 'manual',
}) {
  // Derive mode when not passed: back-compat with the two original call sites
  // (pre-selected station vs camera FAB). Manual mode is only entered via the
  // explicit prop from the new "Sisesta hinnad käsitsi" FAB.
  const effectiveMode: 'station' | 'camera' | 'manual' =
    mode ?? (station ? 'station' : 'camera');
  const isManualMode = effectiveMode === 'manual';

  const [resolvedStation, setResolvedStation] = useState<any | null>(null);
  const [stationCandidates, setStationCandidates] = useState<any[] | null>(null);
  const [prices, setPrices] = useState<{ [key: string]: string }>(EMPTY_PRICES);
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [brandMismatch, setBrandMismatch] = useState<{ detected: string } | null>(null);
  const [autoSelectMsg, setAutoSelectMsg] = useState<string | null>(null);
  const [capturedPosition, setCapturedPosition] = useState<{ lat: number; lon: number } | null>(null);
  const [pendingDetectedBrand, setPendingDetectedBrand] = useState<string | null>(null);
  const [pricesFromAi, setPricesFromAi] = useState(false);
  const [manualGpsError, setManualGpsError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Reset and initialise state when the modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setResolvedStation(station);
      setStationCandidates(null);
      setCapturedBase64(null);
      setCapturedPreviewUrl(null);
      setScanError(null);
      setBrandMismatch(null);
      setAutoSelectMsg(null);
      onPhotoExpandedChange(false);
      setCapturedPosition(null);
      setPendingDetectedBrand(null);
      setPricesFromAi(false);
      setManualGpsError(null);
      setSubmitSuccess(false);
      setPrices(EMPTY_PRICES);
      if (effectiveMode === 'camera') {
        // Camera FAB mode: auto-open camera immediately
        setTimeout(() => fileInputRef.current?.click(), 300);
      } else if (effectiveMode === 'manual') {
        capture('manual_opened');
        captureLocationForManual();
      } else if (effectiveMode === 'station') {
        // Drawer path ("muuda hindu"): capture GPS so we can enforce the
        // 1 km proximity cap at submit time. Without this, anyone could
        // submit prices for any station in the country.
        captureLocationForStation();
      }
    }
  }, [isOpen]);

  // When GPS arrives after the AI scan finishes, resolve station candidates.
  // Handles both successful scans (use detected brand) and failures (any nearby).
  useEffect(() => {
    if (!capturedPosition || station || !allStations || resolvedStation || stationCandidates || isAnalyzing) return;
    if (pendingDetectedBrand !== null) {
      resolveNearbyCandidates(capturedPosition.lat, capturedPosition.lon, pendingDetectedBrand);
      setPendingDetectedBrand(null);
    } else if (scanError) {
      resolveNearbyCandidates(capturedPosition.lat, capturedPosition.lon);
    }
  }, [scanError, capturedPosition, pendingDetectedBrand, isAnalyzing]);

  if (!isOpen) return null;

  const callGemini = async (base64: string, stationName: string): Promise<any> => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        setRetryStatus(`Uuesti proovimas... (${attempt}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, 2000));
      }

      // Abort after 55 s — one tick under the Node serverless maxDuration (60 s)
      // so the client surfaces a dedicated TIMEOUT error before Vercel drops the
      // connection as a generic "Failed to fetch".
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 55000);
      let res: Response;
      try {
        // Pin to apex on production hostnames. Old PWA installs load from
        // www.kyts.ee but Vercel 308-redirects /api/* to apex, and Safari aborts
        // the cross-origin POST preflight on the redirected destination.
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        const apiBase = host === 'kyts.ee' || host === 'www.kyts.ee' ? 'https://kyts.ee' : '';
        res = await fetch(`${apiBase}/api/parse-prices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, stationName }),
          signal: ac.signal,
        });
      } catch (e: any) {
        clearTimeout(timer);
        if (e?.name === 'AbortError') {
          if (attempt < MAX_RETRIES) continue;
          throw new Error('TIMEOUT');
        }
        // Network-level failure (DNS, offline, connection dropped). Retry.
        if (attempt < MAX_RETRIES) continue;
        throw new Error('NETWORK');
      }
      clearTimeout(timer);

      if (res.ok) {
        capture('ai_scan_success');
        // Wrap body-read: iOS Safari can truncate the response stream and throw
        // "TypeError: Load failed" here, which otherwise escapes the fetch
        // try/catch above and surfaces as a raw Sentry error.
        try { return await res.json(); }
        catch {
          if (attempt < MAX_RETRIES) continue;
          throw new Error('NETWORK');
        }
      }
      if (res.status === 429) throw new Error('QUOTA_EXCEEDED');
      if (res.status === 503 && attempt < MAX_RETRIES) continue;
      if (res.status === 503) throw new Error('AI_UPSTREAM_BUSY');

      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
  };

  const applyParsedPrices = (parsedJson: any) => {
    let gotAny = false;
    setPrices(prev => {
      const copy = { ...prev };
      for (const type of FUEL_TYPES) {
        if (parsedJson[type]) {
          // Display with Estonian-locale comma so both flows match.
          copy[type] = parsedJson[type].toString().replace('.', ',');
          gotAny = true;
        }
      }
      return copy;
    });
    if (gotAny) setPricesFromAi(true);
  };

  // Resolve nearby station candidates from a known position.
  // Tiered radius: 0.5 km for auto-select confidence, then fall back to the
  // submit cap (1 km) as a picker. GPS-skew headroom above 500 m exists so a
  // canopy / cold-PWA fix doesn't strand the user at the station they're
  // standing at, but anything beyond MAX_SUBMIT_KM would be rejected by the
  // server's proximity trigger anyway — so don't offer it in the picker.
  const resolveNearbyCandidates = (lat: number, lon: number, detectedBrand?: string) => {
    if (!allStations?.length) return;

    const TIGHT_KM = 0.5;
    const FALLBACK_KM = MAX_SUBMIT_KM;
    const withDist = allStations.map(s => ({
      ...s,
      _dist: haversineKm(lat, lon, s.latitude, s.longitude)
    })).sort((a, b) => a._dist - b._dist);

    const tight = withDist.filter(s => s._dist <= TIGHT_KM);
    const fallback = withDist.filter(s => s._dist <= FALLBACK_KM);

    if (fallback.length === 0) {
      setScanError('NO_NEARBY_STATION');
      return;
    }

    const pool = tight.length > 0 ? tight : fallback;
    let candidates = pool;
    if (detectedBrand) {
      const brandLower = detectedBrand.toLowerCase();
      const brandMatches = pool.filter(s =>
        s.name?.toLowerCase().includes(brandLower) ||
        brandLower.includes(s.name?.toLowerCase())
      );
      if (brandMatches.length > 0) candidates = brandMatches;
    }

    // Only auto-select when we had a tight-radius match AND it's unambiguous.
    // Fallback-radius results always go through the picker so the user
    // confirms — GPS was already unreliable once, don't compound.
    if (tight.length > 0 && candidates.length === 1) {
      setResolvedStation(candidates[0]);
      setAutoSelectMsg(`Valitud: ${getStationDisplayName(candidates[0])}`);
      setTimeout(() => setAutoSelectMsg(null), 4000);
    } else {
      setStationCandidates(candidates.slice(0, 10));
    }
  };

  // Manual mode: strict 500 m radius, no auto-select, no brand filter. Spec is
  // explicit that a single tap of the manual FAB should land the user in a
  // small, precise list they fully control.
  const MANUAL_RADIUS_KM = 0.5;
  const buildManualCandidates = (lat: number, lon: number) => {
    if (!allStations?.length) { setStationCandidates([]); return; }
    const withDist = allStations
      .map(s => ({ ...s, _dist: haversineKm(lat, lon, s.latitude, s.longitude) }))
      .filter(s => s._dist <= MANUAL_RADIUS_KM)
      .sort((a, b) => a._dist - b._dist);
    setStationCandidates(withDist);
  };

  const captureLocationForManual = () => {
    setManualGpsError(null);
    setStationCandidates(null);
    setCapturedPosition(null);
    getCurrentPositionAsync()
      .then(pos => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setCapturedPosition(p);
        buildManualCandidates(p.lat, p.lon);
      })
      .catch((e: any) => {
        const kind = (e?.kind as 'permission' | 'unavailable' | 'timeout' | 'unsupported') || 'unavailable';
        // Permission and unsupported are user-actionable; skip Sentry noise.
        // Timeout/unavailable are the interesting failure modes — log so we can
        // see browser/OS patterns when GPS silently fails inside the manual flow.
        if (kind === 'timeout' || kind === 'unavailable') {
          Sentry.captureMessage('Manual entry geolocation failed', {
            level: 'warning',
            tags: { feature: 'manual-entry-gps', kind },
            extra: { code: e?.code, message: e?.message },
          });
        }
        setManualGpsError(geolocationErrorMessage(kind));
      });
  };

  const captureLocationForStation = () => {
    setManualGpsError(null);
    setCapturedPosition(null);
    getCurrentPositionAsync()
      .then(pos => {
        setCapturedPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      })
      .catch((e: any) => {
        const kind = (e?.kind as 'permission' | 'unavailable' | 'timeout' | 'unsupported') || 'unavailable';
        if (kind === 'timeout' || kind === 'unavailable') {
          Sentry.captureMessage('Station entry geolocation failed', {
            level: 'warning',
            tags: { feature: 'station-entry-gps', kind },
            extra: { code: e?.code, message: e?.message },
          });
        }
        setManualGpsError(geolocationErrorMessage(kind));
      });
  };

  const runScan = async (base64: string, stationNameHint: string) => {
    setScanError(null);
    setBrandMismatch(null);
    setIsAnalyzing(true);
    setRetryStatus(null);
    try {
      const parsedJson = await callGemini(base64, stationNameHint);

      // Server signals when Gemini returned valid JSON but no readable prices —
      // different UX than network failure: keep the photo, show specific copy.
      if (parsedJson && parsedJson.extractedAny === false) {
        Sentry.captureMessage('AI scan returned no prices', {
          level: 'warning',
          extra: { detectedBrand: parsedJson.detectedBrand, stationHint: stationNameHint },
        });
        setScanError('NO_PRICES_READ');
        if (!station && allStations && capturedPosition && !resolvedStation) {
          resolveNearbyCandidates(capturedPosition.lat, capturedPosition.lon, parsedJson.detectedBrand || '');
        } else if (!station && allStations && !capturedPosition) {
          setPendingDetectedBrand(parsedJson.detectedBrand || '');
        }
        return;
      }

      applyParsedPrices(parsedJson);

      if (!station && allStations) {
        // Camera FAB mode — resolve station via GPS + detected brand
        if (capturedPosition) {
          resolveNearbyCandidates(capturedPosition.lat, capturedPosition.lon, parsedJson.detectedBrand || '');
        } else {
          // GPS not back yet — stash brand for the late-GPS effect to use
          setPendingDetectedBrand(parsedJson.detectedBrand || '');
        }
      } else if (station && parsedJson.isBrandMatch === false) {
        // Pre-selected station mode only — warn if AI sees a different brand
        setBrandMismatch({ detected: parsedJson.detectedBrand || 'teine kett' });
      }
    } catch (error: any) {
      console.error("AI Analysis failed:", error);
      // Skip Sentry noise for known user-facing states: quota, transient Gemini
      // outages, and retry-exhausted client network drops. All four already
      // surface UX copy and are not actionable beyond "connection was bad."
      const skipSentry = new Set(['QUOTA_EXCEEDED', 'AI_UPSTREAM_BUSY', 'NETWORK', 'TIMEOUT']);
      if (!skipSentry.has(error?.message)) {
        Sentry.captureException(error, {
          tags: { feature: 'ai-scan' },
          extra: { stationHint: stationNameHint },
        });
      }
      setScanError(error.message);
      // Still resolve station candidates on AI failure so user can enter prices manually
      if (!station && allStations && capturedPosition && !resolvedStation) {
        resolveNearbyCandidates(capturedPosition.lat, capturedPosition.lon);
      }
    } finally {
      setIsAnalyzing(false);
      setRetryStatus(null);
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Capture GPS immediately — before AI processing delays change the position.
    // The helper already has a 15 s timeout; on failure surface an actionable
    // error instead of letting the submit button hang on "Ootan GPS-signaali...".
    if (!station && allStations) {
      getCurrentPositionAsync()
        .then(pos => setCapturedPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude }))
        .catch(() => setScanError('NO_GPS'));
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 1200;
        let w = img.width, h = img.height;
        if (w > h && w > MAX_SIZE) { h = h * (MAX_SIZE / w); w = MAX_SIZE; }
        else if (h > MAX_SIZE) { w = w * (MAX_SIZE / h); h = MAX_SIZE; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);

        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedBase64(base64);
        setCapturedPreviewUrl(base64);
        // Empty hint in FAB mode tells the API to use its "unknown station" prompt,
        // which is more reliable for price extraction than passing a fake placeholder.
        const stationName = station?.name || resolvedStation?.name || '';
        runScan(base64, stationName);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleManualRetry = () => {
    if (capturedBase64) {
      const stationName = station?.name || resolvedStation?.name || '';
      runScan(capturedBase64, stationName);
    }
  };

  const handleClose = () => {
    setResolvedStation(null);
    setStationCandidates(null);
    setCapturedBase64(null);
    setCapturedPreviewUrl(null);
    setScanError(null);
    setBrandMismatch(null);
    setAutoSelectMsg(null);
    setCapturedPosition(null);
    setPendingDetectedBrand(null);
    setPricesFromAi(false);
    setManualGpsError(null);
    setSubmitSuccess(false);
    setPrices(EMPTY_PRICES);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeStation = resolvedStation;
    if (!activeStation) return;

    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    const parsed = Object.entries(prices)
      .filter(([_, price]) => price.trim() !== '')
      .map(([type, price]) => ({
        type,
        value: parseFloat(price.replace(',', '.')),
      }));

    const invalid = parsed.find(p => !Number.isFinite(p.value) || p.value <= 0 || p.value >= 10);
    if (invalid) {
      alert(`Hind peab olema vahemikus 0–10 € (${invalid.type}: ${invalid.value}).`);
      setLoading(false);
      return;
    }

    // Proximity gate: submitter must be within MAX_SUBMIT_KM of the station.
    // Prevents anyone from reporting prices for stations on the other side
    // of the country. The server trigger re-checks the same invariant so
    // direct-API writes can't bypass it.
    if (!capturedPosition) {
      alert('GPS-asukoht on vajalik hinna sisestamiseks. Luba asukoht ja proovi uuesti.');
      setLoading(false);
      return;
    }
    const submitDist = haversineKm(
      capturedPosition.lat, capturedPosition.lon,
      activeStation.latitude, activeStation.longitude
    );
    if (submitDist > MAX_SUBMIT_KM) {
      const distStr = submitDist < 10 ? submitDist.toFixed(1) : Math.round(submitDist).toString();
      alert(`Oled tanklast ${distStr} km kaugusel. Hindu saab sisestada vaid siis, kui oled tankla juures (kuni ${MAX_SUBMIT_KM} km).`);
      capture('price_submit_blocked_distance', { distance_km: +submitDist.toFixed(2) });
      setLoading(false);
      return;
    }

    const entryMethod = isManualMode ? 'manual' : 'camera';
    const inserts = parsed.map(p => ({
      station_id: activeStation.id,
      fuel_type: p.type,
      price: p.value,
      user_id: user?.id || null,
      entry_method: entryMethod,
      submitted_lat: capturedPosition.lat,
      submitted_lon: capturedPosition.lon,
    }));

    if (inserts.length > 0) {
      const { error } = await supabase.from('prices').insert(inserts);
      if (error) {
        alert("Viga hinna salvestamisel!");
        setLoading(false);
        return;
      }
      capture('price_submitted', { count: inserts.length, from_ai: pricesFromAi, entry_method: entryMethod });
      onPricesSubmitted();
      if (isManualMode) {
        // Manual flow: confirm save inline, then close after a short beat so
        // the user sees the result instead of the modal disappearing mid-tap.
        setSubmitSuccess(true);
        setLoading(false);
        setTimeout(() => handleClose(), 1200);
        return;
      }
      handleClose();
    } else {
      handleClose();
    }

    setLoading(false);
  };

  const activeStation = resolvedStation;
  const isFabMode = !station && !!allStations;
  const isStationMode = effectiveMode === 'station';
  const submitDistanceKm = (isStationMode && capturedPosition && activeStation)
    ? haversineKm(capturedPosition.lat, capturedPosition.lon, activeStation.latitude, activeStation.longitude)
    : null;
  const tooFar = submitDistanceKm != null && submitDistanceKm > MAX_SUBMIT_KM;

  // Submit-button label: reflects what the app is actually waiting on,
  // instead of blaming the user with "Vali esmalt tankla" in every state.
  const getSubmitLabel = () => {
    if (loading) return 'Salvestan...';
    if (isManualMode) {
      if (activeStation) return 'Salvesta';
      if (manualGpsError) return 'Asukoht vajalik';
      if (!capturedPosition) return 'Ootan GPS-signaali...';
      if (stationCandidates && stationCandidates.length === 0) return 'Jaamu ei leitud';
      return 'Vali tankla loendist';
    }
    if (activeStation) {
      if (isStationMode && manualGpsError) return 'Asukoht vajalik';
      if (isStationMode && !capturedPosition) return 'Ootan GPS-signaali...';
      if (isStationMode && tooFar) return 'Oled liiga kaugel';
      return pricesFromAi ? 'Kinnita' : 'Salvesta';
    }
    if (isAnalyzing) return 'AI loeb pilti...';
    if (isFabMode && capturedBase64 && !capturedPosition && !scanError) return 'Ootan GPS-signaali...';
    if (stationCandidates && stationCandidates.length > 0) return 'Vali tankla loendist';
    if (isFabMode && !capturedBase64) return 'Pildista hinnaposti';
    return 'Vali esmalt tankla';
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        padding: '24px 24px calc(24px + env(safe-area-inset-bottom)) 24px',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <div className="flex-between" style={{ marginBottom: '24px' }}>
          <h2 className="heading-1">
            {activeStation
              ? `Uued Hinnad: ${getStationDisplayName(activeStation)}`
              : isManualMode
                ? 'Sisesta hinnad'
                : 'Skaneeri Hinnad'}
          </h2>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Station-drawer mode: GPS permission / unavailable — submit is blocked. */}
        {isStationMode && manualGpsError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--color-text)' }}>{manualGpsError}</span>
            <button
              type="button"
              onClick={captureLocationForStation}
              style={{
                background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#ef4444', borderRadius: '8px', padding: '6px 12px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '0.85rem', fontWeight: '600', flexShrink: 0
              }}
            >
              <RefreshCw size={14} />
              Proovi uuesti
            </button>
          </div>
        )}

        {/* Station-drawer mode: waiting on first GPS fix. */}
        {isStationMode && !manualGpsError && !capturedPosition && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            color: 'var(--color-text-muted)', fontSize: '0.9rem',
            padding: '12px 4px', marginBottom: '8px'
          }}>
            <Loader2 size={16} className="spin" />
            Kontrollin asukohta...
          </div>
        )}

        {/* Station-drawer mode: user is too far from the station. */}
        {isStationMode && tooFar && submitDistanceKm != null && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <MapPin size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--color-text)' }}>
              Oled tanklast {submitDistanceKm < 10 ? submitDistanceKm.toFixed(1) : Math.round(submitDistanceKm)} km kaugusel. Hindu saab sisestada vaid tankla juures (kuni {MAX_SUBMIT_KM} km).
            </span>
            <button
              type="button"
              onClick={captureLocationForStation}
              style={{
                background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#ef4444', borderRadius: '8px', padding: '6px 12px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '0.85rem', fontWeight: '600', flexShrink: 0
              }}
            >
              <RefreshCw size={14} />
              Värskenda
            </button>
          </div>
        )}

        {/* Manual mode: successful save confirmation (auto-closes shortly after). */}
        {submitSuccess && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.4)',
            borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.95rem', color: 'var(--color-text)'
          }}>
            <Check size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
            Hinnad salvestatud
          </div>
        )}

        {/* Manual mode: GPS permission / unavailable error. */}
        {isManualMode && manualGpsError && !activeStation && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--color-text)' }}>{manualGpsError}</span>
            <button
              type="button"
              onClick={captureLocationForManual}
              style={{
                background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#ef4444', borderRadius: '8px', padding: '6px 12px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '0.85rem', fontWeight: '600', flexShrink: 0
              }}
            >
              <RefreshCw size={14} />
              Proovi uuesti
            </button>
          </div>
        )}

        {/* Manual mode: waiting on first GPS fix. */}
        {isManualMode && !manualGpsError && !capturedPosition && !activeStation && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            color: 'var(--color-text-muted)', fontSize: '0.9rem',
            padding: '12px 4px', marginBottom: '8px'
          }}>
            <Loader2 size={16} className="spin" />
            Asukohta tuvastatakse...
          </div>
        )}

        {/* Manual mode: no stations within the 500 m radius. */}
        {isManualMode && !activeStation && stationCandidates !== null && stationCandidates.length === 0 && !manualGpsError && (
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
            borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '16px',
            display: 'flex', flexDirection: 'column', gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MapPin size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.95rem', color: 'var(--color-text)' }}>
                500 m raadiuses ei leitud ühtegi jaama.
              </span>
            </div>
            <button
              type="button"
              onClick={() => { capture('manual_location_refreshed'); captureLocationForManual(); }}
              style={{
                background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
                color: 'var(--color-primary)', borderRadius: '8px', padding: '10px 14px',
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px',
                fontSize: '0.9rem', fontWeight: '600', alignSelf: 'flex-start'
              }}
            >
              <RefreshCw size={14} />
              Värskenda asukohta
            </button>
          </div>
        )}

        {/* Manual mode: "Muuda jaama" — return to picker, keeping draft prices. */}
        {isManualMode && activeStation && (
          <button
            type="button"
            onClick={() => {
              setResolvedStation(null);
              // Rebuild list from the last captured position rather than
              // re-prompting GPS — the user just wants to pick a different
              // station from what they already saw.
              if (capturedPosition) buildManualCandidates(capturedPosition.lat, capturedPosition.lon);
            }}
            style={{
              background: 'transparent', border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-muted)', borderRadius: 'var(--radius-md)',
              padding: '10px 14px', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontSize: '0.9rem', fontWeight: '500', alignSelf: 'flex-start', marginBottom: '12px'
            }}
          >
            <ArrowLeft size={14} />
            Muuda jaama
          </button>
        )}

        {/* Auto-select confirmation toast */}
        {autoSelectMsg && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.4)',
            borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--color-text)'
          }}>
            <MapPin size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
            {autoSelectMsg}
          </div>
        )}

        {/* Station picker (camera FAB or manual mode, at least one candidate) */}
        {(isFabMode || isManualMode) && !activeStation && stationCandidates !== null && stationCandidates.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            {pricesFromAi && (
              <div style={{
                background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.35)',
                borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: '12px',
                fontSize: '0.85rem', color: 'var(--color-text)',
                display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center'
              }}>
                <span style={{ fontWeight: 600, color: '#22c55e' }}>AI tuvastas hinnad:</span>
                {FUEL_TYPES.filter(t => prices[t]).map(t => (
                  <span key={t} style={{ display: 'inline-flex', gap: '4px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t === 'Bensiin 95' ? '95' : t === 'Bensiin 98' ? '98' : t === 'Diisel' ? 'D' : t}</span>
                    <span style={{ fontWeight: 600 }}>€{prices[t]}</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: 0 }}>
                {isManualMode ? 'Vali tankla, millele hindu lisad:' : 'Vali tankla, mille hindu uuendad:'}
              </p>
              {isManualMode && (
                <button
                  type="button"
                  onClick={() => { capture('manual_location_refreshed'); captureLocationForManual(); }}
                  title="Värskenda asukohta"
                  style={{
                    background: 'transparent', border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-muted)', borderRadius: '8px',
                    padding: '6px 10px', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '0.8rem', fontWeight: '500', flexShrink: 0
                  }}
                >
                  <RefreshCw size={12} />
                  Värskenda
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '40vh', overflowY: 'auto' }}>
              {stationCandidates.map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    if (isManualMode) capture('manual_station_selected');
                    setResolvedStation(s);
                    setStationCandidates(null);
                  }}
                  style={{
                    background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
                    borderRadius: 'var(--radius-md)', padding: '14px 16px', cursor: 'pointer',
                    color: 'var(--color-text)', textAlign: 'left', fontSize: '0.95rem', fontWeight: '500',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px'
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getStationDisplayName(s)}
                    </span>
                    {isManualMode && (s.amenities?.['addr:street'] || s.amenities?.['addr:city']) && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', fontWeight: '400' }}>
                        {[s.amenities?.['addr:street'], s.amenities?.['addr:city']].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </span>
                  {s._dist != null && (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', fontWeight: '400', flexShrink: 0 }}>
                      {s._dist < 1 ? `${Math.round(s._dist * 1000)}m` : `${s._dist.toFixed(1)}km`}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Expanded photo overlay */}
        {photoExpanded && capturedPreviewUrl && (
          <div
            onClick={() => onPhotoExpandedChange(false)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 3000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '24px', cursor: 'pointer'
            }}
          >
            <img
              src={capturedPreviewUrl}
              alt="Skaneeritud pilt"
              style={{
                maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                borderRadius: 'var(--radius-md)'
              }}
            />
          </div>
        )}

        {/* Scan button + photo thumbnail — camera-based flows only. */}
        {!isManualMode && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'stretch' }}>
          {capturedPreviewUrl && (
            <img
              src={capturedPreviewUrl}
              alt="Skaneeritud pilt"
              onClick={() => onPhotoExpandedChange(true)}
              style={{
                width: '80px', height: '80px', objectFit: 'cover',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-border)',
                flexShrink: 0, cursor: 'pointer'
              }}
            />
          )}
          {/* Upload-from-gallery is only offered when the user already picked a
              station (the "muuda hindu" flow). The map FAB launches the camera
              directly for live totem scans; offering a gallery button there would
              just confuse the flow. */}
          {!!station && (
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => galleryInputRef.current?.click()}
              style={{
                background: 'rgba(59, 130, 246, 0.05)', color: 'var(--color-primary)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 'var(--radius-md)', padding: '16px', fontSize: '0.95rem', fontWeight: 'bold',
                flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              <Upload size={20} />
              Laadi pilt
            </button>
          )}
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 'var(--radius-md)', padding: '16px', fontSize: '0.95rem', fontWeight: 'bold',
              flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {isAnalyzing ? <Loader2 size={20} className="spin" /> : <Camera size={20} />}
            {retryStatus || (isAnalyzing ? 'AI loeb...' : capturedPreviewUrl ? 'Uuesti' : station ? 'Kaameraga' : 'Skaneeri hinnad kaameraga')}
          </button>
        </div>
        )}

        {!isManualMode && (
        <>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleCameraCapture}
          />
          <input
            type="file"
            ref={galleryInputRef}
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleCameraCapture}
          />
        </>
        )}

        {/* Brand mismatch warning */}
        {brandMismatch && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px',
            display: 'flex', alignItems: 'flex-start', gap: '10px'
          }}>
            <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
            <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--color-text)' }}>
              Pildil tundub olevat <strong>{brandMismatch.detected}</strong> tankla, aga uuendad <strong>{activeStation?.name}</strong> hindu. Kontrolli, kas hinnad on õiged.
            </span>
            <button onClick={() => setBrandMismatch(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0 }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Scan error */}
        {scanError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--color-text)' }}>
              {scanError === 'QUOTA_EXCEEDED'
                ? 'AI teenuse limiit on täis. Proovi hiljem uuesti või sisesta hinnad käsitsi.'
                : scanError === 'AI_UPSTREAM_BUSY'
                ? 'AI teenus on hetkel ülekoormatud. Proovi paari minuti pärast uuesti või sisesta hinnad käsitsi.'
                : scanError === 'NO_NEARBY_STATION'
                ? `Läheduses (${MAX_SUBMIT_KM}km raadiuses) ei leitud ühtegi tankla. Kontrolli GPS-lubasid või vali jaam käsitsi.`
                : scanError === 'NO_GPS'
                ? 'GPS-signaali ei saadud. Kontrolli asukoha lubasid ja proovi uuesti.'
                : scanError === 'NO_PRICES_READ'
                ? 'AI ei suutnud hindu pildilt lugeda. Proovi otse totemi ette, väldi peegeldusi, või sisesta hinnad käsitsi.'
                : scanError === 'TIMEOUT'
                ? 'AI võttis liiga kaua aega. Proovi uuesti või sisesta hinnad käsitsi.'
                : scanError === 'NETWORK'
                ? 'Võrguviga. Kontrolli internetiühendust ja proovi uuesti.'
                : 'AI lugemine ebaõnnestus. Sisesta hinnad käsitsi või proovi uuesti.'}
            </span>
            <button
              onClick={handleManualRetry}
              disabled={isAnalyzing}
              style={{
                background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#ef4444', borderRadius: '8px', padding: '6px 12px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '0.85rem', fontWeight: '600', flexShrink: 0
              }}
            >
              <RefreshCw size={14} />
              Proovi uuesti
            </button>
          </div>
        )}

        {(!isManualMode || !!activeStation) && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {FUEL_TYPES.map(type => (
            <div key={type} className="glass-panel flex-between" style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontWeight: '500' }}>{type}</span>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>€</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,000"
                  value={prices[type]}
                  onChange={e => {
                    // Estonian locale uses comma as the decimal separator.
                    // Accept either on input and normalise dots to commas so
                    // the displayed string stays consistent; the submit path
                    // swaps comma → dot before parseFloat.
                    let v = e.target.value.replace(/[^\d.,]/g, '').replace(/\./g, ',');
                    const firstSep = v.indexOf(',');
                    if (firstSep >= 0) {
                      // Only one separator allowed — drop any trailing commas.
                      v = v.slice(0, firstSep + 1) + v.slice(firstSep + 1).replace(/,/g, '');
                    }
                    const prev = prices[type] || '';
                    // Auto-insert decimal comma after the first digit on typing
                    // (fuel prices are always in the 0–9 € range).
                    if (!v.includes(',') && v.length === 2 && prev.length === 1) {
                      v = v[0] + ',' + v[1];
                    }
                    // Cap to 3 decimals (prices are quoted to the thousandth).
                    const sep = v.indexOf(',');
                    if (sep >= 0 && v.length - sep - 1 > 3) v = v.slice(0, sep + 4);
                    setPrices({ ...prices, [type]: v });
                  }}
                  style={{
                    background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text)', padding: '8px 12px 8px 32px', borderRadius: '8px', outline: 'none',
                    width: '120px', fontSize: '1.2rem', fontWeight: 'bold'
                  }}
                />
              </div>
            </div>
          ))}

          <button
            type="submit"
            disabled={loading || !activeStation || (isStationMode && (!capturedPosition || !!manualGpsError || tooFar))}
            style={{
              background: activeStation && !(isStationMode && (!capturedPosition || !!manualGpsError || tooFar)) ? 'var(--color-primary)' : 'var(--color-surface)',
              color: activeStation && !(isStationMode && (!capturedPosition || !!manualGpsError || tooFar)) ? 'white' : 'var(--color-text-muted)',
              border: 'none', borderRadius: 'var(--radius-md)',
              padding: '16px', fontSize: '1.1rem', fontWeight: '600', width: '100%', marginTop: '8px',
              cursor: activeStation && !(isStationMode && (!capturedPosition || !!manualGpsError || tooFar)) ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
          >
            <Check size={20} />
            {getSubmitLabel()}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
