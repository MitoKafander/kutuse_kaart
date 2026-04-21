import { useState, useRef, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { X, Check, Camera, Loader2, AlertTriangle, RefreshCw, MapPin, Upload, ArrowLeft } from 'lucide-react';
import { supabase } from '../supabase';
import { getStationDisplayName, haversineKm, getCurrentPositionAsync, geolocationErrorMessageKey, fuelLabel } from '../utils';
import { capture } from '../utils/analytics';
import * as Sentry from '@sentry/react';

const FUEL_TYPES = ["Bensiin 95", "Bensiin 98", "Diisel", "LPG"];
const MAX_RETRIES = 2;
// Exponential backoff between retry attempts (ms). A flat 2 s gap covered the
// first retry in ~6–8 s total, which wasn't long enough to ride out typical
// Gemini 503 "overloaded" bursts — users would burn all 3 attempts against the
// same overloaded window and only succeed after force-reopening the app 30 s
// later. 2.5 s → 8 s stretches the total retry window to ~15 s, which covers
// most transient upstream hiccups without making a genuine outage feel slower.
// Indexed by attempt number; attempt 0 is the initial try (no wait).
const RETRY_BACKOFF_MS = [0, 2500, 8000];
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
  pendingScanRestore,
}: {
  station: any | null,
  isOpen: boolean,
  onClose: () => void,
  onPricesSubmitted: (pointsEarned?: number) => void,
  allStations?: any[],
  photoExpanded: boolean,
  onPhotoExpandedChange: (expanded: boolean) => void,
  mode?: 'station' | 'camera' | 'manual',
  // When set, the modal is being re-opened post-reload to resume an
  // interrupted AI scan. Skip the file picker, pre-fill the captured
  // photo + station context, and immediately re-run the scan.
  pendingScanRestore?: {
    base64: string;
    stationId: string | null;
    capturedPosition: { lat: number; lon: number } | null;
    pendingDetectedBrand: string | null;
  } | null,
}) {
  // Derive mode when not passed: back-compat with the two original call sites
  // (pre-selected station vs camera FAB). Manual mode is only entered via the
  // explicit prop from the new "Sisesta hinnad käsitsi" FAB.
  const { t } = useTranslation();
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

  // Scan-failure diagnostics. The reported "AI is overloaded that only clears
  // after app reopen" pattern isn't answerable from the existing ai_scan_failure
  // event (which only knows the error code). Stamp the session start and last
  // success so we can filter PostHog by session age, and keep a streak so we
  // can nudge users out of the loop with a "try reopening the app" hint.
  const sessionStartRef = useRef<number>(Date.now());
  const lastSuccessAtRef = useRef<number | null>(null);
  const failureStreakRef = useRef<number>(0);

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
      // Fresh open (no restore) clears the auto-reload single-shot guard so
      // a future failure in this session can use the escape hatch again.
      if (!pendingScanRestore?.base64) {
        sessionStorage.removeItem('kyts:scan-reload-attempted');
      }
      if (effectiveMode === 'camera' && pendingScanRestore?.base64) {
        // Resume an interrupted scan after the auto-reload-retry. Skip the
        // file picker, restore the photo + last-known context, and re-run
        // the scan in place. The scan-reload-attempted sessionStorage flag
        // stays set until the scan succeeds (or the modal closes), so a
        // second consecutive failure surfaces the normal error UI instead
        // of looping into another reload.
        const restored = pendingScanRestore;
        setCapturedBase64(restored.base64);
        setCapturedPreviewUrl(restored.base64);
        if (restored.capturedPosition) setCapturedPosition(restored.capturedPosition);
        if (restored.pendingDetectedBrand) setPendingDetectedBrand(restored.pendingDetectedBrand);
        const preResolved = restored.stationId
          ? allStations?.find((s: any) => s.id === restored.stationId) ?? null
          : null;
        if (preResolved) setResolvedStation(preResolved);
        capture('ai_scan_reload_restored');
        runScan(restored.base64, preResolved?.name || '');
      } else if (effectiveMode === 'camera') {
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
    let lastVercelId: string | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        setRetryStatus(t('manualPrice.camera.retryStatus', { attempt, max: MAX_RETRIES }));
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS[attempt] ?? 8000));
      }

      // Abort after 55 s — one tick under the Node serverless maxDuration (60 s)
      // so the client surfaces a dedicated TIMEOUT error before Vercel drops the
      // connection as a generic "Failed to fetch".
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 55000);
      let res: Response;
      try {
        // Pin AI calls to a dedicated subdomain on production hostnames. The
        // browser pools HTTP/2 connections per origin, so giving AI traffic
        // its own host (ai.kyts.ee) isolates it from any future app-side
        // activity that could poison the main kyts.ee pool — long-lived tabs
        // have been seen losing the AI endpoint while the rest of the app
        // kept working, only recoverable via tab close+reopen.
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        const isProd = host === 'kyts.ee' || host === 'www.kyts.ee' || host === 'ai.kyts.ee';
        const apiBase = isProd ? 'https://ai.kyts.ee' : '';
        // cache: 'no-store' defeats HTTP/2 preflight caching that iOS Safari
        // sometimes resurrects after long PWA backgrounding — a cheap nudge
        // toward a fresh connection for each scan.
        res = await fetch(`${apiBase}/api/parse-prices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, stationName }),
          signal: ac.signal,
          cache: 'no-store',
        });
      } catch (e: any) {
        clearTimeout(timer);
        if (e?.name === 'AbortError') {
          if (attempt < MAX_RETRIES) continue;
          const err: any = new Error('TIMEOUT');
          err.attemptsMade = attempt + 1;
          throw err;
        }
        // Network-level failure (DNS, offline, connection dropped). Retry.
        if (attempt < MAX_RETRIES) continue;
        const err: any = new Error('NETWORK');
        err.attemptsMade = attempt + 1;
        throw err;
      }
      clearTimeout(timer);
      lastVercelId = res.headers.get('x-vercel-id');

      if (res.ok) {
        capture('ai_scan_success');
        // Wrap body-read: iOS Safari can truncate the response stream and throw
        // "TypeError: Load failed" here, which otherwise escapes the fetch
        // try/catch above and surfaces as a raw Sentry error.
        try { return await res.json(); }
        catch {
          if (attempt < MAX_RETRIES) continue;
          const err: any = new Error('NETWORK');
          err.attemptsMade = attempt + 1;
          err.vercelId = lastVercelId;
          throw err;
        }
      }
      // Server distinguishes per-IP burst (RATE_LIMITED) from daily/Gemini
      // (QUOTA_EXCEEDED) via a code field. Fall back to QUOTA_EXCEEDED only
      // when the server didn't set a code (old deploys).
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const err: any = new Error(body.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'QUOTA_EXCEEDED');
        err.attemptsMade = attempt + 1;
        err.vercelId = lastVercelId;
        throw err;
      }
      if (res.status === 503 && attempt < MAX_RETRIES) continue;
      if (res.status === 503) {
        const err: any = new Error('AI_UPSTREAM_BUSY');
        err.attemptsMade = attempt + 1;
        err.vercelId = lastVercelId;
        throw err;
      }

      const body = await res.json().catch(() => ({}));
      const err: any = new Error(body.error || `HTTP ${res.status}`);
      err.attemptsMade = attempt + 1;
      err.vercelId = lastVercelId;
      throw err;
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
      setAutoSelectMsg(t('manualPrice.picker.autoSelected', { name: getStationDisplayName(candidates[0]) }));
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
        setManualGpsError(t(geolocationErrorMessageKey(kind)));
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
        setManualGpsError(t(geolocationErrorMessageKey(kind)));
      });
  };

  const runScan = async (base64: string, stationNameHint: string) => {
    setScanError(null);
    setBrandMismatch(null);
    setIsAnalyzing(true);
    setRetryStatus(null);
    try {
      const parsedJson = await callGemini(base64, stationNameHint);
      // Reset streak on any successful round-trip, even NO_PRICES_READ —
      // the upstream path is healthy, the failure is in the photo itself.
      lastSuccessAtRef.current = Date.now();
      failureStreakRef.current = 0;
      // Mark the auto-reload-retry as recovered so we can measure the fix's
      // hit rate, then clear the single-shot guard so the next scan in this
      // session can use the escape hatch again if needed.
      if (sessionStorage.getItem('kyts:scan-reload-attempted')) {
        capture('ai_scan_reload_recovered');
        sessionStorage.removeItem('kyts:scan-reload-attempted');
      }

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
        setBrandMismatch({ detected: parsedJson.detectedBrand || t('manualPrice.brandMismatch.fallback') });
      }
    } catch (error: any) {
      console.error("AI Analysis failed:", error);
      failureStreakRef.current += 1;
      // Track every failure by code plus session context so we can answer
      // "does this happen after long idle?" from PostHog. Without age/streak
      // we only know the distribution of codes, not the pattern triggering
      // them. Include x-vercel-id so we can cross-reference the server log.
      capture('ai_scan_failure', {
        code: error?.message || 'UNKNOWN',
        session_age_ms: Date.now() - sessionStartRef.current,
        since_last_success_ms: lastSuccessAtRef.current != null
          ? Date.now() - lastSuccessAtRef.current
          : null,
        failure_streak: failureStreakRef.current,
        attempts_made: error?.attemptsMade ?? null,
        vercel_id: error?.vercelId ?? null,
      });
      // Skip Sentry noise for known user-facing states: quota, transient Gemini
      // outages, and retry-exhausted client network drops. All five already
      // surface UX copy and are not actionable beyond "connection was bad."
      const skipSentry = new Set(['QUOTA_EXCEEDED', 'RATE_LIMITED', 'AI_UPSTREAM_BUSY', 'NETWORK', 'TIMEOUT']);
      if (!skipSentry.has(error?.message)) {
        Sentry.captureException(error, {
          tags: { feature: 'ai-scan' },
          extra: { stationHint: stationNameHint, vercelId: error?.vercelId },
        });
      }
      // Auto-reload-and-retry escape hatch: long-lived sessions can hit a
      // poisoned client-side connection state where every retry on this tab
      // continues to fail (user reproduced this with a 3-min gap between
      // attempts; only a tab close+reopen recovered). Stash the photo + GPS
      // + brand context, reload, and resume the scan on mount with a fresh
      // tab. The single-shot guard prevents looping if even the post-reload
      // attempt fails.
      const RELOADABLE_CODES = new Set(['AI_UPSTREAM_BUSY', 'NETWORK', 'TIMEOUT']);
      const alreadyTried = sessionStorage.getItem('kyts:scan-reload-attempted');
      if (RELOADABLE_CODES.has(error?.message) && !alreadyTried && capturedBase64) {
        capture('ai_scan_reload_retry', {
          code: error.message,
          attempts_made: error?.attemptsMade ?? null,
        });
        sessionStorage.setItem('kyts:scan-reload-attempted', '1');
        try {
          sessionStorage.setItem('kyts:pending-scan', JSON.stringify({
            base64: capturedBase64,
            stationId: station?.id ?? resolvedStation?.id ?? null,
            capturedPosition,
            pendingDetectedBrand,
          }));
          window.location.reload();
          return;
        } catch {
          // Quota or serialization failure — fall through to the normal
          // error UI rather than reload into an empty restore.
          sessionStorage.removeItem('kyts:scan-reload-attempted');
        }
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

  // Transient Supabase failures (Postgrest 5xx, dropped TCP, edge-router
  // hiccup) are the root cause of user-reported "submitted, got an error,
  // tried again and it worked". A single in-band retry after 800 ms hides
  // those without the user having to think about it. Deterministic errors
  // (RLS deny, trigger violation, unique key) are not retried — they'd
  // just fail the same way and waste a second of UX.
  const submitPricesWithRetry = async (inserts: any[]) => {
    let lastError: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { error } = await supabase.from('prices').insert(inserts);
      if (!error) return { error: null, attempts: attempt };
      lastError = error;
      const code: string = error.code || '';
      // Postgres SQLSTATE class 23 = integrity violations; 42501 = RLS deny.
      // These are deterministic on the same input — no point retrying.
      const deterministic = code === '42501' || code.startsWith('23');
      if (deterministic) break;
      await new Promise(r => setTimeout(r, 800));
    }
    return { error: lastError, attempts: 2 };
  };

  // Convert a Supabase/Postgres error into user-facing Estonian copy. The
  // distance-rejection case is the only common deterministic miss (client
  // and server sometimes disagree by a few metres at the 1 km edge); the
  // rest collapse into a generic retry prompt since the auto-retry above
  // already burned one attempt on transient failures.
  const friendlyPriceSubmitError = (err: any): string => {
    const code: string = err?.code || '';
    const msg: string = err?.message || '';
    if (msg.includes('km from station')) return t('manualPrice.submitError.tooFar');
    if (msg.includes('velocity exceeded')) return t('manualPrice.submitError.tooFast');
    if (code === '42501') return t('manualPrice.submitError.rls');
    if (msg.includes('station') && msg.includes('not found')) return t('manualPrice.submitError.notFound');
    return t('manualPrice.submitError.generic');
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
      alert(t('manualPrice.alert.priceRange', { type: invalid.type, value: invalid.value }));
      setLoading(false);
      return;
    }

    // Proximity gate: submitter must be within MAX_SUBMIT_KM of the station.
    // Prevents anyone from reporting prices for stations on the other side
    // of the country. The server trigger re-checks the same invariant so
    // direct-API writes can't bypass it.
    if (!capturedPosition) {
      alert(t('manualPrice.alert.gpsRequired'));
      setLoading(false);
      return;
    }
    const submitDist = haversineKm(
      capturedPosition.lat, capturedPosition.lon,
      activeStation.latitude, activeStation.longitude
    );
    if (submitDist > MAX_SUBMIT_KM) {
      const distStr = submitDist < 10 ? submitDist.toFixed(1) : Math.round(submitDist).toString();
      alert(t('manualPrice.alert.tooFar', { distance: distStr, max: MAX_SUBMIT_KM }));
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
      const { error, attempts } = await submitPricesWithRetry(inserts);
      if (error) {
        alert(friendlyPriceSubmitError(error));
        // Capture to Sentry + PostHog so we stop flying blind on intermittent
        // failures. Warning level (not error) because the user isn't broken,
        // just blocked; we don't want to pollute the Sentry inbox with
        // every transient hiccup that the retry didn't save.
        Sentry.captureMessage('price_submit_failed', {
          level: 'warning',
          tags: { feature: 'price-submit' },
          extra: {
            code: error.code,
            message: error.message,
            hint: error.hint,
            details: error.details,
            attempts,
            station_id: activeStation.id,
            fuel_types: parsed.map(p => p.type),
            entry_method: entryMethod,
          },
        });
        capture('price_submit_failed', {
          code: error.code || 'unknown',
          entry_method: entryMethod,
          attempts,
        });
        setLoading(false);
        return;
      }
      capture('price_submitted', { count: inserts.length, from_ai: pricesFromAi, entry_method: entryMethod, attempts });
      // Each price row scores +1 in the activity leaderboard formula, so the
      // count doubles as the points just earned (the corner toast shows +N).
      onPricesSubmitted(user?.id ? inserts.length : 0);
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
    if (loading) return t('manualPrice.submit.saving');
    if (isManualMode) {
      if (activeStation) return t('manualPrice.submit.save');
      if (manualGpsError) return t('manualPrice.submit.locationNeeded');
      if (!capturedPosition) return t('manualPrice.submit.waitingGps');
      if (stationCandidates && stationCandidates.length === 0) return t('manualPrice.submit.noStations');
      return t('manualPrice.submit.choosePrompt');
    }
    if (activeStation) {
      if (isStationMode && manualGpsError) return t('manualPrice.submit.locationNeeded');
      if (isStationMode && !capturedPosition) return t('manualPrice.submit.waitingGps');
      if (isStationMode && tooFar) return t('manualPrice.submit.tooFar');
      return pricesFromAi ? t('manualPrice.submit.confirm') : t('manualPrice.submit.save');
    }
    if (isAnalyzing) return t('manualPrice.submit.aiReading');
    if (isFabMode && capturedBase64 && !capturedPosition && !scanError) return t('manualPrice.submit.waitingGps');
    if (stationCandidates && stationCandidates.length > 0) return t('manualPrice.submit.choosePrompt');
    if (isFabMode && !capturedBase64) return t('manualPrice.submit.takePhoto');
    return t('manualPrice.submit.firstChoose');
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
              ? t('manualPrice.title.update', { station: getStationDisplayName(activeStation) })
              : isManualMode
                ? t('manualPrice.title.manual')
                : t('manualPrice.title.scan')}
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
              {t('manualPrice.gps.retry')}
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
            {t('manualPrice.gps.checking')}
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
              {t('manualPrice.gps.tooFar', {
                distance: submitDistanceKm < 10 ? submitDistanceKm.toFixed(1) : Math.round(submitDistanceKm),
                max: MAX_SUBMIT_KM,
              })}
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
              {t('manualPrice.gps.refresh')}
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
            {t('manualPrice.manual.savedConfirm')}
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
              {t('manualPrice.gps.retry')}
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
            {t('manualPrice.gps.detecting')}
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
                {t('manualPrice.manual.noStations')}
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
              {t('manualPrice.manual.refreshLocation')}
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
            {t('manualPrice.manual.changeStation')}
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
                <span style={{ fontWeight: 600, color: '#22c55e' }}>{t('manualPrice.picker.aiDetected')}</span>
                {FUEL_TYPES.filter(ft => prices[ft]).map(ft => (
                  <span key={ft} style={{ display: 'inline-flex', gap: '4px' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>{ft === 'Bensiin 95' ? '95' : ft === 'Bensiin 98' ? '98' : ft === 'Diisel' ? 'D' : ft}</span>
                    <span style={{ fontWeight: 600 }}>€{prices[ft]}</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: 0 }}>
                {isManualMode ? t('manualPrice.picker.promptManual') : t('manualPrice.picker.promptUpdate')}
              </p>
              {isManualMode && (
                <button
                  type="button"
                  onClick={() => { capture('manual_location_refreshed'); captureLocationForManual(); }}
                  title={t('manualPrice.picker.refreshTitle')}
                  style={{
                    background: 'transparent', border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-muted)', borderRadius: '8px',
                    padding: '6px 10px', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '0.8rem', fontWeight: '500', flexShrink: 0
                  }}
                >
                  <RefreshCw size={12} />
                  {t('manualPrice.gps.refresh')}
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
              alt={t('manualPrice.camera.scannedAlt')}
              style={{
                maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                borderRadius: 'var(--radius-md)'
              }}
            />
          </div>
        )}

        {/* Scan button + photo thumbnail — camera-based flows, plus manual mode
            once a station is resolved (lets users batch-upload gallery shots
            taken earlier in the field and let AI pre-fill the prices). */}
        {(!isManualMode || resolvedStation) && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'stretch' }}>
          {capturedPreviewUrl && (
            <img
              src={capturedPreviewUrl}
              alt={t('manualPrice.camera.scannedAlt')}
              onClick={() => onPhotoExpandedChange(true)}
              style={{
                width: '80px', height: '80px', objectFit: 'cover',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-border)',
                flexShrink: 0, cursor: 'pointer'
              }}
            />
          )}
          {/* Upload-from-gallery is only offered when the user already picked a
              station (the "muuda hindu" flow, or manual mode post-picker). The
              map FAB launches the camera directly for live totem scans; offering
              a gallery button there would just confuse the flow. */}
          {(!!station || (isManualMode && resolvedStation)) && (
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
              {t('manualPrice.camera.uploadFromGallery')}
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
            {retryStatus || (isAnalyzing
              ? t('manualPrice.camera.aiReading')
              : capturedPreviewUrl
                ? t('manualPrice.camera.retake')
                : station ? t('manualPrice.camera.scanPrices') : t('manualPrice.camera.scanPricesLong'))}
          </button>
        </div>
        )}

        {(!isManualMode || resolvedStation) && (
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
              <Trans
                i18nKey="manualPrice.brandMismatch.message"
                values={{ detected: brandMismatch.detected, station: activeStation?.name }}
                components={{ strong: <strong /> }}
              />
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
            display: 'flex', flexDirection: 'column', gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--color-text)' }}>
                {scanError === 'QUOTA_EXCEEDED'
                  ? t('manualPrice.scanError.quotaExceeded')
                  : scanError === 'RATE_LIMITED'
                  ? t('manualPrice.scanError.rateLimited')
                  : scanError === 'AI_UPSTREAM_BUSY'
                  ? t('manualPrice.scanError.aiUpstreamBusy')
                  : scanError === 'NO_NEARBY_STATION'
                  ? t('manualPrice.scanError.noNearbyStation', { max: MAX_SUBMIT_KM })
                  : scanError === 'NO_GPS'
                  ? t('manualPrice.scanError.noGps')
                  : scanError === 'NO_PRICES_READ'
                  ? t('manualPrice.scanError.noPricesRead')
                  : scanError === 'TIMEOUT'
                  ? t('manualPrice.scanError.timeout')
                  : scanError === 'NETWORK'
                  ? t('manualPrice.scanError.network')
                  : t('manualPrice.scanError.generic')}
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
                {t('manualPrice.gps.retry')}
              </button>
            </div>
          </div>
        )}

        {(!isManualMode || !!activeStation) && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {FUEL_TYPES.map(type => (
            <div key={type} className="glass-panel flex-between" style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontWeight: '500' }}>{fuelLabel(type, t)}</span>
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
            {loading ? <Loader2 size={20} className="spin" /> : <Check size={20} />}
            {getSubmitLabel()}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
