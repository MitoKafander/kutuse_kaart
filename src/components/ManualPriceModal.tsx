import { useState, useRef, useEffect } from 'react';
import { X, Check, Camera, Loader2, AlertTriangle, RefreshCw, MapPin } from 'lucide-react';
import { supabase } from '../supabase';
import { getStationDisplayName, haversineKm } from '../utils';

const FUEL_TYPES = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];
const MAX_RETRIES = 2;
const EMPTY_PRICES = { "Bensiin 95": "", "Bensiin 98": "", "Diisel": "", "LPG": "" };

export function ManualPriceModal({
  station,
  isOpen,
  onClose,
  onPricesSubmitted,
  allStations,
}: {
  station: any | null,
  isOpen: boolean,
  onClose: () => void,
  onPricesSubmitted: () => void,
  allStations?: any[],
}) {
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
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setPhotoExpanded(false);
      setPrices(EMPTY_PRICES);
      // Camera FAB mode: auto-open camera immediately
      if (!station && allStations) {
        setTimeout(() => fileInputRef.current?.click(), 300);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const callGemini = async (base64: string, stationName: string): Promise<any> => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        setRetryStatus(`Uuesti proovimas... (${attempt}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, 2000));
      }

      const res = await fetch('/api/parse-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, stationName })
      });

      if (res.ok) return res.json();
      if (res.status === 429) throw new Error('QUOTA_EXCEEDED');
      if (res.status === 503 && attempt < MAX_RETRIES) continue;

      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
  };

  const applyParsedPrices = (parsedJson: any) => {
    setPrices(prev => {
      const copy = { ...prev };
      for (const type of FUEL_TYPES) {
        if (parsedJson[type]) copy[type] = parsedJson[type].toString().replace(',', '.');
      }
      return copy;
    });
  };

  // Given a detected brand and the scanned photo, pick the best nearby station
  const autoSelectByGps = (detectedBrand: string) => {
    if (!allStations?.length) return;

    const handlePosition = (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords;

      const nearby500 = allStations.filter(s =>
        haversineKm(latitude, longitude, s.latitude, s.longitude) <= 0.5
      );

      const brandLower = detectedBrand.toLowerCase();
      const brandMatches = nearby500.filter(s =>
        s.name?.toLowerCase().includes(brandLower) ||
        brandLower.includes(s.name?.toLowerCase())
      );

      const candidates = brandMatches.length > 0 ? brandMatches : nearby500;

      if (candidates.length === 1) {
        setResolvedStation(candidates[0]);
        setAutoSelectMsg(`Valitud: ${getStationDisplayName(candidates[0])}`);
        setTimeout(() => setAutoSelectMsg(null), 4000);
      } else {
        // Show picker (show all nearby if no brand match)
        setStationCandidates(candidates.length > 0 ? candidates : nearby500.slice(0, 10));
      }
    };

    navigator.geolocation.getCurrentPosition(
      handlePosition,
      () => setStationCandidates(allStations.slice(0, 20))
    );
  };

  const runScan = async (base64: string, stationNameHint: string) => {
    setScanError(null);
    setBrandMismatch(null);
    setIsAnalyzing(true);
    setRetryStatus(null);
    try {
      const parsedJson = await callGemini(base64, stationNameHint);

      // GPS auto-select mode (camera FAB)
      if (!station && allStations) {
        autoSelectByGps(parsedJson.detectedBrand || '');
      } else if (parsedJson.isBrandMatch === false) {
        setBrandMismatch({ detected: parsedJson.detectedBrand || 'teine kett' });
      }

      applyParsedPrices(parsedJson);
    } catch (error: any) {
      console.error("AI Analysis failed:", error);
      setScanError(error.message);
    } finally {
      setIsAnalyzing(false);
      setRetryStatus(null);
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        const stationName = station?.name || resolvedStation?.name || 'tankla';
        runScan(base64, stationName);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleManualRetry = () => {
    if (capturedBase64) {
      const stationName = station?.name || resolvedStation?.name || 'tankla';
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

    const inserts = Object.entries(prices)
      .filter(([_, price]) => price.trim() !== '')
      .map(([type, price]) => ({
        station_id: activeStation.id,
        fuel_type: type,
        price: parseFloat(price.replace(',', '.')),
        user_id: user?.id || null
      }));

    if (inserts.length > 0) {
      const { error } = await supabase.from('prices').insert(inserts);
      if (error) {
        alert("Viga hinna salvestamisel!");
      } else {
        onPricesSubmitted();
        handleClose();
      }
    } else {
      handleClose();
    }

    setLoading(false);
  };

  const activeStation = resolvedStation;
  const isFabMode = !station && !!allStations;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'flex-end',
    }}>
      <div className="glass-panel animate-slide-up" style={{
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
            {activeStation ? `Uued Hinnad: ${getStationDisplayName(activeStation)}` : 'Skaneeri Hinnad'}
          </h2>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

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

        {/* Station picker (GPS FAB mode, multiple candidates) */}
        {isFabMode && !activeStation && stationCandidates !== null && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
              Vali tankla, mille hindu uuendad:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '40vh', overflowY: 'auto' }}>
              {stationCandidates.map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    setResolvedStation(s);
                    setStationCandidates(null);
                  }}
                  style={{
                    background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
                    borderRadius: 'var(--radius-md)', padding: '14px 16px', cursor: 'pointer',
                    color: 'var(--color-text)', textAlign: 'left', fontSize: '0.95rem', fontWeight: '500'
                  }}
                >
                  {getStationDisplayName(s)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Expanded photo overlay */}
        {photoExpanded && capturedPreviewUrl && (
          <div
            onClick={() => setPhotoExpanded(false)}
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

        {/* Scan button + photo thumbnail */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'stretch' }}>
          {capturedPreviewUrl && (
            <img
              src={capturedPreviewUrl}
              alt="Skaneeritud pilt"
              onClick={() => setPhotoExpanded(true)}
              style={{
                width: '80px', height: '80px', objectFit: 'cover',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-border)',
                flexShrink: 0, cursor: 'pointer'
              }}
            />
          )}
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 'var(--radius-md)', padding: '16px', fontSize: '1rem', fontWeight: 'bold',
              flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {isAnalyzing ? <Loader2 size={20} className="spin" /> : <Camera size={20} />}
            {retryStatus || (isAnalyzing ? 'Tehisintellekt loeb pilti...' : capturedPreviewUrl ? 'Skaneeri uuesti' : 'Skaneeri hinnad kaameraga')}
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleCameraCapture}
        />

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
                ? 'Gemini päevane limiit (20 päringut) on täis. Proovi hiljem uuesti või sisesta hinnad käsitsi.'
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {FUEL_TYPES.map(type => (
            <div key={type} className="glass-panel flex-between" style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontWeight: '500' }}>{type}</span>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>€</span>
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.000"
                  value={prices[type]}
                  onChange={e => setPrices({ ...prices, [type]: e.target.value })}
                  style={{
                    background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
                    color: 'white', padding: '8px 12px 8px 32px', borderRadius: '8px', outline: 'none',
                    width: '120px', fontSize: '1.2rem', fontWeight: 'bold'
                  }}
                />
              </div>
            </div>
          ))}

          <button
            type="submit"
            disabled={loading || !activeStation}
            style={{
              background: activeStation ? 'var(--color-primary)' : 'var(--color-surface)',
              color: activeStation ? 'white' : 'var(--color-text-muted)',
              border: 'none', borderRadius: 'var(--radius-md)',
              padding: '16px', fontSize: '1.1rem', fontWeight: '600', width: '100%', marginTop: '8px', cursor: activeStation ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
          >
            <Check size={20} />
            {loading ? 'Salvestan...' : activeStation ? 'Salvesta' : 'Vali esmalt tankla'}
          </button>
        </form>
      </div>
    </div>
  );
}
