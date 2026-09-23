// Daily (×2) cron: fetch Kyts + global market data, compute per-fuel signals
// deterministically, ask Gemini only to rewrite the numbers as readable text,
// then write a fresh market_insights row and flip the previous one inactive.
//
// Phase 65: this runs once PER COUNTRY. The global series (Brent, RBOB, gasoil,
// EUR/USD) are fetched once and shared; the pump-price side is country-scoped
// through get_kyts_fuel_window_avg(p_country). A country with fewer than
// MIN_SAMPLES local prices in the window is SKIPPED rather than given an
// insight computed from global proxies alone — an oil-futures readout dressed
// up as "what fuel costs near you" would be worse than showing nothing, and
// it would burn Gemini credit per run to say it. Latvia and Lithuania
// therefore stay quiet until their own crowd data arrives, then light up on
// the next cron with no code change.
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
// NOTE: .js extensions are required because the repo's package.json has
// "type": "module" — Node ESM resolves bare relative paths without filling
// in the extension the way tsc -p does. Vercel's bundler respects this.
import { fetchMarketData, fetchLog } from './_lib/marketInsight/fetchMarketData.js';
import { computeFuelSignal, type KytsFuelStats } from './_lib/marketInsight/computeSignal.js';
import { translateWithGemini, type TranslatorInput } from './_lib/marketInsight/geminiTranslator.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

const GENERATION_VERSION = 'v1.2-2026-09-23';

/**
 * Countries the cron generates an insight for.
 *
 * Read from the DATA, not hardcoded: api/ compiles under its own tsconfig and
 * cannot import src/constants/countries.ts, so a literal list here is a second
 * registry that nothing keeps in sync — add a fourth country to the frontend
 * and its market insight would just never be generated, silently. Asking the
 * stations table which countries exist makes that impossible.
 */
async function countriesWithStations(sb: any): Promise<string[]> {
  const { data, error } = await sb.from('stations').select('country').eq('active', true);
  if (error) throw new Error(`country list: ${error.message}`);
  const seen = new Set<string>();
  for (const row of data ?? []) if (row.country) seen.add(row.country);
  return [...seen].sort();
}

/**
 * Minimum local price samples in the 2-day window before a country gets an
 * insight at all. Matches the phase-51 band trigger's bootstrap threshold, for
 * the same reason: below this the local signal is noise.
 */
const MIN_SAMPLES = 20;

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
  country: string,
): Promise<KytsFuelStats> {
  const now = Date.now();
  const DAY = 86400_000;

  const todayStart = new Date(now - 2 * DAY).toISOString();
  const prev7End   = new Date(now - 6 * DAY).toISOString();
  const prev7Start = new Date(now - 9 * DAY).toISOString();
  const prev30End  = new Date(now - 28 * DAY).toISOString();
  const prev30Start = new Date(now - 32 * DAY).toISOString();

  // Push the aggregate into Postgres (phase 53 RPC). The previous
  // row-pulling pattern was silently capped at 1000 rows by PostgREST's
  // db-max-rows ceiling — the moment a fuel-type window crossed that
  // threshold the average would start biasing toward whichever rows landed
  // first in the response. The RPC returns one row per call regardless of
  // window size, so the math stays correct as the table grows.
  async function avg(fromIso: string, toIso?: string) {
    const { data, error } = await sb.rpc('get_kyts_fuel_window_avg', {
      p_fuel_type: fuelType,
      p_from: fromIso,
      p_to: toIso ?? null,
      p_country: country,
    });
    if (error || !data || data.length === 0) {
      return { mean: null as number | null, count: 0 };
    }
    const row = data[0] as { mean: number | string | null; sample_count: number | string };
    const count = Number(row.sample_count);
    if (!count) return { mean: null, count: 0 };
    const mean = row.mean == null ? null : Number(row.mean);
    return { mean, count };
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

/**
 * One country's full pipeline: local averages -> deterministic signals ->
 * Gemini prose -> a fresh active row. Returns what happened, so the handler
 * can report per country without any one of them failing the whole cron.
 */
async function runForCountry(
  sb: any,
  country: string,
  market: Awaited<ReturnType<typeof fetchMarketData>>,
  geminiKey: string | undefined,
  dry: boolean,
): Promise<{ country: string; ok: boolean; skipped?: boolean; reason?: string; insightId?: string; row?: any; signal?: any }> {
  const startedAt = new Date().toISOString();
  let runId: string | null = null;
  if (!dry) {
    const { data: runRow } = await sb.from('market_insight_runs')
      .insert({ started_at: startedAt, status: 'failed_skip', country })
      .select('id')
      .single();
    runId = (runRow as any)?.id ?? null;
  }

  const finishRun = async (status: string, extra: Record<string, any> = {}) => {
    if (!runId) return;
    await sb.from('market_insight_runs')
      .update({ status, completed_at: new Date().toISOString(), ...extra })
      .eq('id', runId);
  };

  try {
    const [dieselStats, gasoline95Stats] = await Promise.all([
      fetchKytsFuelStats(sb, 'Diisel', country),
      fetchKytsFuelStats(sb, 'Bensiin 95', country),
    ]);

    // Not enough local prices to say anything about local pumps. Skip before
    // spending a Gemini call — see MIN_SAMPLES.
    const samples = dieselStats.samples7d + gasoline95Stats.samples7d;
    if (samples < MIN_SAMPLES) {
      const reason = `only ${samples} local sample(s) in window (need ${MIN_SAMPLES})`;
      await finishRun('failed_skip', { error_message: reason });
      return { country, ok: true, skipped: true, reason };
    }

    // Step 3: compute signals deterministically.
    // Diesel's wholesale proxy is the US NY-Harbor ULSD series, which backtested
    // at ~0 correlation with EE diesel pump moves — so it does NOT earn timing
    // calls (proxyReliable: false). Gasoline's RBOB proxy did show real lead
    // skill (r≈0.41), so it keeps the divergence logic. Flip diesel back to
    // reliable once a European diesel benchmark replaces NY-Harbor ULSD.
    const dieselSignal = computeFuelSignal(dieselStats, market.gasoil, market.eurUsd, { proxyReliable: false });
    const gasolineSignal = computeFuelSignal(gasoline95Stats, market.rbob, market.eurUsd);

    // Overall confidence = the confidence of the advice a user would actually
    // act on. If a leg is making a timing call (buy_now/wait), use the least
    // certain such leg; otherwise both legs are just "hold/neutral" and we take
    // the min. This stops diesel's deliberately-low 45 (it no longer makes timing
    // calls — see proxyReliable above) from dragging down a confident gasoline signal.
    const actionable = [dieselSignal, gasolineSignal].filter(s => s.signal === 'buy_now' || s.signal === 'wait');
    const confidence = actionable.length
      ? Math.min(...actionable.map(s => s.confidence))
      : Math.min(dieselSignal.confidence, gasolineSignal.confidence);

    // Assemble the `data` JSONB: this is what the DRAWER renders numbers from.
    const data = {
      country,
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

    // Step 4: Gemini translation. If Gemini is unavailable or rejects, we
    // skip the DB write entirely — the previous active row stays live so
    // users see the last genuine Gemini-generated insight instead of a
    // deterministic template.
    if (!geminiKey) {
      const reason = 'GEMINI_API_KEY unset';
      await finishRun('failed_skip', { error_message: reason, pulse: data });
      return { country, ok: true, skipped: true, reason };
    }

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
    const gemini = await translateWithGemini(geminiKey, translatorInput);
    if (!gemini.ok) {
      await finishRun('failed_skip', { error_message: gemini.reason, pulse: data });
      return { country, ok: true, skipped: true, reason: gemini.reason };
    }
    const text = gemini.out;

    // Pick a `trend` compatible with the legacy phase-39 schema: if either
    // fuel says buy_now we're trending up; wait implies down; everything
    // else is flat. The drawer uses this for the icon on legacy rows and
    // for any UI that hasn't been upgraded yet.
    const trend: 'up' | 'down' | 'flat' =
      dieselSignal.signal === 'buy_now' || gasolineSignal.signal === 'buy_now' ? 'up'
      : dieselSignal.signal === 'wait'   || gasolineSignal.signal === 'wait'   ? 'down'
      : 'flat';

    const newRow = {
      country,
      content_et: text.content_et, content_en: text.content_en,
      content_ru: text.content_ru, content_fi: text.content_fi,
      content_lv: text.content_lv, content_lt: text.content_lt,
      headline_et: text.headline_et, headline_en: text.headline_en,
      headline_ru: text.headline_ru, headline_fi: text.headline_fi,
      headline_lv: text.headline_lv, headline_lt: text.headline_lt,
      signal_diesel: dieselSignal.signal,
      signal_gasoline: gasolineSignal.signal,
      confidence,
      trend,
      data,
      generation_version: GENERATION_VERSION,
      is_active: true,
    };

    if (dry) return { country, ok: true, row: newRow };

    // Step 6: flip THIS COUNTRY's previous active row off, then insert. Scoped
    // by country so generating Latvia's insight can't blank Estonia's.
    const { error: deactErr } = await sb.from('market_insights')
      .update({ is_active: false })
      .eq('is_active', true)
      .eq('country', country);
    if (deactErr) throw new Error(`deactivate failed: ${deactErr.message}`);

    const { data: inserted, error: insErr } = await sb.from('market_insights')
      .insert(newRow)
      .select('id')
      .single();
    if (insErr) throw new Error(`insert failed: ${insErr.message}`);
    const insightId = (inserted as any)?.id as string;

    await finishRun('success', { insight_id: insightId, pulse: data, error_message: null });

    return {
      country,
      ok: true,
      insightId,
      signal: { diesel: dieselSignal.signal, gasoline: gasolineSignal.signal, confidence },
    };
  } catch (err: any) {
    const msg = err?.message || 'unknown error';
    console.error(`[generate-market-insight] ${country} pipeline failed:`, msg);
    await finishRun('failed_skip', { error_message: msg });
    return { country, ok: false, reason: msg };
  }
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

  // `?country=LV` runs one country (manual re-run after a fix); default is all.
  const only = /[?&]country=([A-Za-z]{2})/.exec(req.url ?? '')?.[1]?.toUpperCase();
  let countries: string[];
  try {
    const all = await countriesWithStations(sb);
    countries = only ? all.filter(c => c === only) : all;
    if (!countries.length) {
      return res.status(400).json({ error: only ? `No active stations in ${only}` : 'No active stations at all' });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'could not list countries' });
  }

  try {
    // The global series are identical for every country — fetch once, and let
    // one upstream outage fail the whole cron exactly as it did before.
    const market = await fetchMarketData();

    // Sequential, not parallel: three concurrent Gemini calls is how you meet
    // a rate limit, and the cron has 60s of headroom for three small requests.
    const results = [];
    for (const cc of countries) {
      results.push(await runForCountry(sb, cc, market, GEMINI_KEY, dry));
    }

    const failed = results.filter(r => !r.ok);
    return res.status(failed.length === results.length ? 500 : 200).json({
      ok: failed.length < results.length,
      dryRun: dry || undefined,
      results,
      fetchLog: dry ? fetchLog : undefined,
    });
  } catch (err: any) {
    const msg = err?.message || 'unknown error';
    console.error('[generate-market-insight] market fetch failed:', msg);
    return res.status(500).json({ error: msg });
  }
}
