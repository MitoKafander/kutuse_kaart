// Daily (×2) cron: fetch Kyts + global market data, compute per-fuel signals
// deterministically, ask Gemini only to rewrite the numbers as readable text,
// then write a fresh market_insights row and flip the previous one inactive.
//
// Plan: /Users/mitokafander/.claude/plans/ultrathink-this-part-through-whimsical-sparkle.md
// Schema: migrations/schema_phase40_market_insights_v2.sql
//
// Invocation paths:
//   · Vercel Cron (automatic, twice daily) — vercel.json "crons" section.
//     Vercel attaches `Authorization: Bearer $CRON_SECRET` when configured.
//   · Manual: `curl -H "Authorization: Bearer $CRON_SECRET" .../api/generate-market-insight`
//   · Dry-run: append `?dryRun=1`; skips DB writes, returns the row it WOULD
//     have inserted. Useful for local / preview testing.

import { createClient } from '@supabase/supabase-js';
import { fetchMarketData } from './_lib/marketInsight/fetchMarketData';
import { computeFuelSignal, type KytsFuelStats } from './_lib/marketInsight/computeSignal';
import { translateWithGemini, type TranslatorInput } from './_lib/marketInsight/geminiTranslator';
import { buildFallbackText } from './_lib/marketInsight/fallbackTemplate';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

const GENERATION_VERSION = 'v1.0-2026-04-19';

type NodeReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};
type NodeRes = {
  status: (code: number) => NodeRes;
  setHeader: (name: string, value: string) => void;
  json: (data: any) => void;
};

function authOk(req: NodeReq): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const hdr = req.headers['authorization'];
  const header = Array.isArray(hdr) ? hdr[0] : hdr;
  return header === `Bearer ${secret}`;
}

function isDryRun(url?: string): boolean {
  if (!url) return false;
  return url.includes('dryRun=1') || url.includes('dry_run=1');
}

// Compute Kyts average + sample count for a fuel across two windows:
//   · "today": rows reported in the last 2 days
//   · "prev7": rows reported 6–9 days ago (centered on 7 days ago)
//   · "prev30": rows reported 28–32 days ago
// We deliberately exclude the `prev*` windows from the `today` window to avoid
// overlap that would suppress the delta.
// Deliberately untyped — the helper is internal and the fully-parameterized
// SupabaseClient<...> shape is noisy to thread through a private function.
async function fetchKytsFuelStats(
  sb: any,
  fuelType: string,
): Promise<KytsFuelStats> {
  const now = Date.now();
  const DAY = 86400_000;

  const todayStart = new Date(now - 2 * DAY).toISOString();
  const prev7End   = new Date(now - 6 * DAY).toISOString();
  const prev7Start = new Date(now - 9 * DAY).toISOString();
  const prev30End  = new Date(now - 28 * DAY).toISOString();
  const prev30Start = new Date(now - 32 * DAY).toISOString();

  // Join through stations to filter country='EE'. Supabase embedded selects
  // let us express this as an inner join via `stations!inner(country)`.
  const baseSelect = 'price, stations!inner(country)';
  const eeFilter = { col: 'stations.country', eq: 'EE' } as const;

  async function avg(fromIso: string, toIso?: string) {
    let q = sb.from('prices')
      .select(baseSelect)
      .eq('fuel_type', fuelType)
      .eq(eeFilter.col, eeFilter.eq)
      .gte('reported_at', fromIso);
    if (toIso) q = q.lt('reported_at', toIso);
    const { data, error } = await q.limit(5000);
    if (error || !data) return { mean: null as number | null, count: 0 };
    const rows = data as Array<{ price: number }>;
    if (rows.length === 0) return { mean: null, count: 0 };
    const sum = rows.reduce((a, r) => a + r.price, 0);
    return { mean: sum / rows.length, count: rows.length };
  }

  const [todayR, prev7R, prev30R] = await Promise.all([
    avg(todayStart),
    avg(prev7Start, prev7End),
    avg(prev30Start, prev30End),
  ]);

  return {
    today: todayR.mean,
    prev7: prev7R.mean,
    prev30: prev30R.mean,
    samples7d: todayR.count,
  };
}

export default async function handler(req: NodeReq, res: NodeRes) {
  // Vercel Cron only POSTs. A manual curl may GET. Accept either.
  if (req.method && !['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!authOk(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dry = isDryRun(req.url);
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Server missing Supabase service-role credentials.' });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = new Date().toISOString();
  let runId: string | null = null;
  if (!dry) {
    const { data: runRow } = await sb.from('market_insight_runs')
      .insert({ started_at: startedAt, status: 'failed_skip' })
      .select('id')
      .single();
    runId = (runRow as any)?.id ?? null;
  }

  try {
    // Step 1 + 2 in parallel: Kyts avgs + global market series.
    const [dieselStats, gasoline95Stats, market] = await Promise.all([
      fetchKytsFuelStats(sb, 'Diisel'),
      fetchKytsFuelStats(sb, 'Bensiin 95'),
      fetchMarketData(),
    ]);

    // Step 3: compute signals deterministically.
    const dieselSignal = computeFuelSignal(dieselStats, market.gasoil, market.eurUsd);
    const gasolineSignal = computeFuelSignal(gasoline95Stats, market.rbob, market.eurUsd);

    // Overall confidence = min of the two (take the less certain leg).
    const confidence = Math.min(dieselSignal.confidence, gasolineSignal.confidence);

    // Assemble the `data` JSONB: this is what the DRAWER renders numbers from.
    const data = {
      kyts: {
        diesel: { today: dieselStats.today, prev7: dieselStats.prev7, samples7d: dieselStats.samples7d },
        gasoline95: { today: gasoline95Stats.today, prev7: gasoline95Stats.prev7, samples7d: gasoline95Stats.samples7d },
      },
      globals: {
        brent: market.brent ? { today: market.brent.today, delta7d: (market.brent.today - market.brent.prev7) / market.brent.prev7, asOf: market.brent.asOf } : null,
        eurUsd: market.eurUsd ? { today: market.eurUsd.today, delta7d: (market.eurUsd.today - market.eurUsd.prev7) / market.eurUsd.prev7, asOf: market.eurUsd.asOf } : null,
        gasoil: market.gasoil ? { today: market.gasoil.today, delta7d: (market.gasoil.today - market.gasoil.prev7) / market.gasoil.prev7, asOf: market.gasoil.asOf } : null,
        rbob: market.rbob ? { today: market.rbob.today, delta7d: (market.rbob.today - market.rbob.prev7) / market.rbob.prev7, asOf: market.rbob.asOf } : null,
      },
      signals: {
        diesel: dieselSignal,
        gasoline: gasolineSignal,
      },
    };

    // Step 4: Gemini translation (best-effort — fallback template on any failure).
    let text: ReturnType<typeof buildFallbackText>;
    let usedGemini = false;
    if (GEMINI_KEY) {
      const translatorInput: TranslatorInput = {
        diesel: dieselSignal,
        gasoline: gasolineSignal,
        kytsAvg: { diesel: dieselStats.today, gasoline95: gasoline95Stats.today },
        globals: {
          brentUsd: market.brent?.today ?? null,
          brentDelta7d: market.brent ? (market.brent.today - market.brent.prev7) / market.brent.prev7 : null,
          eurUsd: market.eurUsd?.today ?? null,
          eurUsdDelta7d: market.eurUsd ? (market.eurUsd.today - market.eurUsd.prev7) / market.eurUsd.prev7 : null,
          gasoilDelta7d: market.gasoil ? (market.gasoil.today - market.gasoil.prev7) / market.gasoil.prev7 : null,
          rbobDelta7d: market.rbob ? (market.rbob.today - market.rbob.prev7) / market.rbob.prev7 : null,
        },
      };
      const gemini = await translateWithGemini(GEMINI_KEY, translatorInput);
      if (gemini) { text = gemini; usedGemini = true; }
      else text = buildFallbackText(dieselSignal, gasolineSignal);
    } else {
      text = buildFallbackText(dieselSignal, gasolineSignal);
    }

    // Pick a `trend` compatible with the legacy phase-39 schema: if either
    // fuel says buy_now we're trending up; wait implies down; everything
    // else is flat. The drawer uses this for the icon on legacy rows and
    // for any UI that hasn't been upgraded yet.
    const trend: 'up' | 'down' | 'flat' =
      dieselSignal.signal === 'buy_now' || gasolineSignal.signal === 'buy_now' ? 'up'
      : dieselSignal.signal === 'wait'   || gasolineSignal.signal === 'wait'   ? 'down'
      : 'flat';

    const newRow = {
      content_et: text.content_et,
      content_en: text.content_en,
      headline_et: text.headline_et,
      headline_en: text.headline_en,
      signal_diesel: dieselSignal.signal,
      signal_gasoline: gasolineSignal.signal,
      confidence,
      trend,
      data,
      generation_version: GENERATION_VERSION,
      is_active: true,
    };

    if (dry) {
      return res.status(200).json({ ok: true, dryRun: true, usedGemini, row: newRow });
    }

    // Step 6: flip previous active rows off, then insert.
    const { error: deactErr } = await sb.from('market_insights')
      .update({ is_active: false })
      .eq('is_active', true);
    if (deactErr) throw new Error(`deactivate failed: ${deactErr.message}`);

    const { data: inserted, error: insErr } = await sb.from('market_insights')
      .insert(newRow)
      .select('id')
      .single();
    if (insErr) throw new Error(`insert failed: ${insErr.message}`);
    const insightId = (inserted as any)?.id as string;

    if (runId) {
      await sb.from('market_insight_runs')
        .update({
          status: usedGemini ? 'success' : 'failed_fallback',
          insight_id: insightId,
          completed_at: new Date().toISOString(),
          pulse: data,
          error_message: usedGemini ? null : 'Gemini unavailable or guardrail-rejected; used template',
        })
        .eq('id', runId);
    }

    return res.status(200).json({
      ok: true,
      insightId,
      usedGemini,
      signal: { diesel: dieselSignal.signal, gasoline: gasolineSignal.signal, confidence },
    });
  } catch (err: any) {
    const msg = err?.message || 'unknown error';
    console.error('[generate-market-insight] pipeline failed:', msg);
    if (runId) {
      await sb.from('market_insight_runs')
        .update({ status: 'failed_skip', completed_at: new Date().toISOString(), error_message: msg })
        .eq('id', runId);
    }
    return res.status(500).json({ error: msg });
  }
}
