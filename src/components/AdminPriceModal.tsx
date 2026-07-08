import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Check, Loader2, Search, ShieldCheck, MapPin } from 'lucide-react';
import { supabase } from '../supabase';
import { getStationDisplayName } from '../utils';
import * as Sentry from '@sentry/react';

// Owner-only price entry. Bypasses the phase31/43/51 submission guards via the
// phase62 admin path in the DB, so prices for far-away (incl. cross-border)
// stations — e.g. the Latvia/Lithuania Facebook postings — can be entered by
// hand with a chosen station, price and timestamp. Rendered ONLY when the
// logged-in user is the owner (see App.tsx long-press gate); the DB is the real
// authority, this modal is just the console. Deliberately English + unpolished:
// it is not part of the public app surface.

const FUEL_TYPES = ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG'] as const;

// datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time (no timezone suffix).
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminPriceModal({
  isOpen,
  onClose,
  allStations,
  onPricesSubmitted,
  userId,
  preselectedStation,
}: {
  isOpen: boolean;
  onClose: () => void;
  allStations: any[];
  onPricesSubmitted: (pointsEarned?: number) => void;
  userId: string | null;
  // When set (opened from the map / StationDrawer), skip the search and lock
  // straight onto this station. null = opened from the FAB, show the search.
  preselectedStation?: any | null;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [whenLocal, setWhenLocal] = useState<string>(() => toLocalInput(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset every time the modal is (re)opened. If a station was preselected
  // (map / StationDrawer flow), lock onto it and skip the search entirely.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(preselectedStation ?? null);
      setPrices({});
      setWhenLocal(toLocalInput(new Date()));
      setError(null);
      setDone(false);
      setSubmitting(false);
      if (!preselectedStation) setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen, preselectedStation]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Mirror the global search's field coverage (App.tsx searchResults) so the
    // same stations are findable here — name, city, STREET and OSM node name.
    // Missing addr:street was why "Linnu tee" didn't resolve. Plus country.
    return allStations
      .filter(s => {
        const name = (s.name || '').toLowerCase();
        const city = (s.amenities?.['addr:city'] || '').toLowerCase();
        const street = (s.amenities?.['addr:street'] || '').toLowerCase();
        const nodeName = (s.amenities?.name || '').toLowerCase();
        const country = (s.country || 'EE').toLowerCase();
        return name.includes(q) || city.includes(q) || street.includes(q)
          || nodeName.includes(q) || country.includes(q);
      })
      .slice(0, 40);
  }, [query, allStations]);

  if (!isOpen) return null;

  const anyPrice = FUEL_TYPES.some(f => {
    const v = parseFloat(prices[f]);
    return Number.isFinite(v) && v > 0;
  });

  const canSubmit = !!selected && !!userId && anyPrice && !!whenLocal && !submitting;

  async function handleSubmit() {
    if (!selected || !userId) return;
    setError(null);

    const reportedAt = new Date(whenLocal);
    if (isNaN(reportedAt.getTime())) {
      setError('Invalid date/time.');
      return;
    }

    const rows = FUEL_TYPES
      .map(f => ({ f, v: parseFloat(prices[f]) }))
      .filter(({ v }) => Number.isFinite(v) && v > 0)
      .map(({ f, v }) => ({
        station_id: selected.id,
        fuel_type: f,
        price: Math.round(v * 1000) / 1000,
        user_id: userId,
        entry_method: 'admin',
        reported_at: reportedAt.toISOString(),
      }));

    if (rows.length === 0) {
      setError('Enter at least one price.');
      return;
    }
    // Sanity band that the DB still enforces even for admin (phase50).
    const outOfBand = rows.find(r => r.price < 0.3 || r.price > 4.0);
    if (outOfBand) {
      setError(`Price ${outOfBand.price} is outside 0.30–4.00 €.`);
      return;
    }

    setSubmitting(true);

    // Retry transient/network failures ("TypeError: Failed to fetch" — request
    // never reached Supabase, e.g. a mobile network blip or an ad/tracking
    // blocker hiccup) up to 3 attempts with backoff, mirroring the crowd flow's
    // submitPricesWithRetry. Fail fast on deterministic DB errors (integrity
    // 23*, RLS 42501) — those won't change on retry.
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error: insErr } = await supabase.from('prices').insert(rows);
        if (!insErr) { lastErr = null; break; }
        lastErr = insErr;
        const code: string = insErr.code || '';
        if (code === '42501' || code.startsWith('23')) break; // deterministic
      } catch (e: any) {
        lastErr = e; // network/transport error — retryable
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 800));
    }

    if (lastErr) {
      Sentry.captureException(lastErr, { tags: { flow: 'admin-price-insert' } });
      setError(lastErr.message || String(lastErr) || 'Insert failed.');
      setSubmitting(false);
      return;
    }
    setDone(true);
    onPricesSubmitted(0);
    setTimeout(onClose, 900);
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
      zIndex: 3200, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel animate-slide-up" style={{
        width: '92%', maxWidth: '520px', maxHeight: '88vh', overflowY: 'auto',
        backgroundColor: 'var(--color-bg)', padding: '24px',
        display: 'flex', flexDirection: 'column',
      }}>
        <div className="flex-between" style={{ marginBottom: '14px' }}>
          <h2 className="heading-1" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={22} /> Admin: add price
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {done ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-primary)', padding: '20px 0' }}>
            <Check size={22} /> <strong>Saved.</strong>
          </div>
        ) : (
          <>
            {/* Station picker */}
            {selected ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
                padding: '12px 14px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-primary)', background: 'rgba(59,130,246,0.14)',
              }}>
                <MapPin size={18} style={{ flexShrink: 0, color: 'var(--color-primary)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {getStationDisplayName(selected)}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    {(selected.country || 'EE')} · {selected.latitude?.toFixed(4)}, {selected.longitude?.toFixed(4)}
                  </div>
                </div>
                <button
                  onClick={() => { setSelected(null); setTimeout(() => searchRef.current?.focus(), 50); }}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  change
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search station by name, city or country…"
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '11px 12px 11px 36px',
                      borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-border)',
                      background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.95rem',
                    }}
                  />
                </div>
                {query.trim() && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '240px', overflowY: 'auto' }}>
                    {matches.length === 0 && (
                      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', padding: '8px 4px' }}>
                        No stations found. (Stations must already exist — this modal can't create them.)
                      </div>
                    )}
                    {matches.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelected(s)}
                        style={{
                          textAlign: 'left', padding: '9px 12px', borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)',
                          color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.9rem',
                          display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center',
                        }}
                      >
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {getStationDisplayName(s)}
                        </span>
                        <span style={{ flexShrink: 0, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                          {s.country || 'EE'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Price inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              {FUEL_TYPES.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ width: '92px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>{f}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min="0"
                    value={prices[f] ?? ''}
                    onChange={e => setPrices(p => ({ ...p, [f]: e.target.value }))}
                    placeholder="—"
                    style={{
                      flex: 1, boxSizing: 'border-box', padding: '10px 12px',
                      borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-border)',
                      background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '1rem',
                    }}
                  />
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>€/l</span>
                </div>
              ))}
            </div>

            {/* Date + time */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                Observed at (reported_at)
              </label>
              <input
                type="datetime-local"
                value={whenLocal}
                onChange={e => setWhenLocal(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-border)',
                  background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.95rem',
                }}
              />
            </div>

            {error && (
              <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '12px' }}>{error}</div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                padding: '13px', border: 'none', borderRadius: 'var(--radius-md)',
                background: canSubmit ? 'var(--color-primary)' : 'var(--color-surface)',
                color: canSubmit ? '#000' : 'var(--color-text-muted)',
                fontWeight: 600, fontSize: '1rem',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              {submitting ? <><Loader2 size={18} className="spin" /> Saving…</> : <>Save price</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminPriceModal;
