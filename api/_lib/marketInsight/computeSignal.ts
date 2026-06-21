// Deterministic "buy now / hold / wait / neutral" signal for Kyts.
//
// The core claim: Estonian pump prices follow Rotterdam wholesale (proxied by
// ICE Gasoil for diesel, NYMEX RBOB for gasoline) with a 5–10 day lag. So if
// wholesale has moved meaningfully and pump prices haven't caught up yet, a
// move is pending. We encode that as a divergence check on 7-day deltas.
//
// THE LLM IS NEVER CALLED FROM HERE. If Gemini hallucinates a story later in
// the pipeline, the `signal_*` fields and the numbers in `data` are already
// correct, and the drawer renders them regardless of the AI text.

import type { Series } from './fetchMarketData.js';

export type Signal = 'buy_now' | 'hold' | 'wait' | 'neutral';

export type FuelSignal = {
  signal: Signal;
  confidence: number;       // 0–90, never 100
  pumpDelta7d: number;      // fractional change (0.042 = +4.2%)
  wholesaleDelta7d: number; // fractional change in EUR terms
  divergence: number;       // wholesaleDelta7d − pumpDelta7d
  reasonCode: string;       // short machine-readable tag, e.g. "pump_lagging_up"
};

export type KytsFuelStats = {
  /** Mean of the last 2 days of EE reports for this fuel. null = no data. */
  today: number | null;
  /** Mean of the 7–9 day window (centered on 7 days ago). */
  prev7: number | null;
  /** Mean of the 28–32 day window (centered on 30 days ago). */
  prev30: number | null;
  /** Count of rows that went into `today` — if < 20 we degrade to neutral. */
  samples7d: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function confidenceFrom(absDivergence: number): number {
  // Scale divergence (fractional) → 50–70. Recalibrated against the backtest:
  // even the old conf-90 calls were only ~64% accurate over 76 days of EE data,
  // so the ceiling is 70 (not 90) and the slope is gentler. 1.5% divergence
  // yields ~58, 4%+ saturates at 70. Below threshold is handled upstream.
  return clamp(Math.round(50 + absDivergence * 500), 50, 70);
}

// Convert USD-denominated wholesale Series to EUR terms on the fly, so "wholesale
// up 3%" is always in the currency the user actually pays in.
function wholesaleInEur(ws: Series, fx: Series): { today: number; prev7: number } {
  // fx.today is EUR→USD. To convert USD price → EUR we divide by EUR/USD.
  // prev7 uses prev7 of both legs; if fx has no history (ECB fallback), both
  // prev7 and today share the same rate, which simply zeroes FX's contribution.
  return {
    today: ws.today / fx.today,
    prev7: ws.prev7 / fx.prev7,
  };
}

export function computeFuelSignal(
  kyts: KytsFuelStats,
  wholesale: Series | null,
  fx: Series | null,
  opts: { proxyReliable?: boolean } = {},
): FuelSignal {
  // proxyReliable=false means this fuel's wholesale series doesn't actually
  // anticipate EE pump moves (diesel: the US NY-Harbor ULSD proxy backtested at
  // ~0 / slightly negative correlation). We then refuse to emit timing calls off
  // it — see the early return below.
  const proxyReliable = opts.proxyReliable !== false;

  // Guard rails — any missing input degrades to neutral rather than hallucinating.
  if (!wholesale || !fx || kyts.today == null || kyts.prev7 == null) {
    return {
      signal: 'neutral',
      confidence: 40,
      pumpDelta7d: 0,
      wholesaleDelta7d: 0,
      divergence: 0,
      reasonCode: 'insufficient_data',
    };
  }
  if (kyts.samples7d < 20) {
    return {
      signal: 'neutral',
      confidence: 40,
      pumpDelta7d: 0,
      wholesaleDelta7d: 0,
      divergence: 0,
      reasonCode: 'low_sample_count',
    };
  }

  const eur = wholesaleInEur(wholesale, fx);
  const pumpΔ = (kyts.today - kyts.prev7) / kyts.prev7;
  const wholesaleΔ = (eur.today - eur.prev7) / eur.prev7;
  const divergence = wholesaleΔ - pumpΔ;

  // Unreliable proxy (diesel): the divergence has no demonstrated predictive
  // power for this fuel, so timing calls off it were just confident-wrong noise
  // (the backtest showed conf-90 'buy_now' streaks right before diesel fell, and
  // a pump-mean-reversion alternative failed a bias-free test too). Emit a
  // descriptive, low-confidence reading and never a directional buy/wait. Remove
  // this branch the day a European diesel benchmark (ICE Gasoil/ARA) replaces the
  // US series — then diesel earns the timing logic back.
  if (!proxyReliable) {
    return {
      signal: Math.abs(pumpΔ) < 0.01 ? 'neutral' : 'hold',
      confidence: 45,
      pumpDelta7d: pumpΔ,
      wholesaleDelta7d: wholesaleΔ,
      divergence,
      reasonCode: 'proxy_unreliable',
    };
  }

  // Wholesale surged and pump hasn't caught up → buy before the hike lands.
  if (wholesaleΔ > 0.03 && divergence > 0.015) {
    return {
      signal: 'buy_now',
      confidence: confidenceFrom(Math.abs(divergence)),
      pumpDelta7d: pumpΔ,
      wholesaleDelta7d: wholesaleΔ,
      divergence,
      reasonCode: 'pump_lagging_up',
    };
  }

  // Wholesale dropped but pump is still high → wait for the cut to hit.
  if (wholesaleΔ < -0.03 && divergence < -0.015) {
    return {
      signal: 'wait',
      confidence: confidenceFrom(Math.abs(divergence)),
      pumpDelta7d: pumpΔ,
      wholesaleDelta7d: wholesaleΔ,
      divergence,
      reasonCode: 'pump_lagging_down',
    };
  }

  // Genuinely flat week on both sides.
  if (Math.abs(wholesaleΔ) < 0.01 && Math.abs(pumpΔ) < 0.01) {
    return {
      signal: 'neutral',
      confidence: 55,
      pumpDelta7d: pumpΔ,
      wholesaleDelta7d: wholesaleΔ,
      divergence,
      reasonCode: 'flat_market',
    };
  }

  // Moved but divergence is small — pump is already tracking wholesale, no
  // edge either way. "Hold" means: no reason to act on timing.
  return {
    signal: 'hold',
    confidence: clamp(40 + Math.round(Math.abs(divergence) * 400), 40, 55),
    pumpDelta7d: pumpΔ,
    wholesaleDelta7d: wholesaleΔ,
    divergence,
    reasonCode: 'aligned',
  };
}
