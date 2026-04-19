// Market-data fetchers for the daily Kyts insight cron.
//
// Cloud-egress reality: Yahoo Finance returns 429 to Vercel's AWS IPs, and
// Stooq responds with an empty `Content-disposition: attachment;filename=error.txt`
// body regardless of UA. Both tested and confirmed from the production
// function. So v1 uses:
//
//   · EIA API v2 (eia.gov) — free with an API key, reliable from cloud.
//       · PET.RBRTE.D              — Europe Brent Spot, USD/bbl, daily
//       · PET.EER_EPD2F_PF4_Y35NY_DPG.D — NY Harbor ULSD No 2 Spot, USD/gal,
//                                        daily — diesel wholesale proxy
//       · PET.EER_EPMRU_PF4_Y35NY_DPG.D — NY Harbor RBOB Regular Gasoline
//                                        Spot, USD/gal, daily — gasoline proxy
//   · Frankfurter (api.frankfurter.dev) — ECB reference rates as JSON,
//     keyless, cloud-friendly. Range endpoint returns 7+30d history in one
//     call.
//   · ECB XML — final FX fallback if Frankfurter is down.
//
// Each fetch is wrapped in a 6 s AbortController timeout. On any failure we
// return null — the signal algorithm degrades to `neutral` for that fuel
// rather than crashing the whole run.

export type Series = {
  /** Close price on the most recent session we have. */
  today: number;
  /** Close price ~7 sessions earlier (may be 5-8 depending on weekends). */
  prev7: number;
  /** Close price ~30 sessions earlier. */
  prev30: number;
  /** ISO date of the most recent close. */
  asOf: string;
};

// Tracks per-URL outcomes so the cron handler can surface them in dry-run mode
// without us having to tail Vercel logs. Cleared at the start of every
// fetchMarketData() call.
export const fetchLog: Array<{ url: string; status: number | string; bytes: number }> = [];

async function fetchWithTimeout(url: string, ms = 6000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  // Strip the api_key query param before logging so we don't leak it.
  const short = url.replace(/api_key=[^&]+/, 'api_key=***').slice(0, 110);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'kyts-market-insight/1.0 (+https://kyts.ee)',
        'Accept': 'application/json,text/xml,*/*',
      },
    });
    const body = res.ok ? await res.text() : '';
    fetchLog.push({ url: short, status: res.status, bytes: body.length });
    if (!res.ok) {
      console.warn('[marketInsight] fetch non-ok', res.status, short);
      return null;
    }
    if (body.length < 50) {
      console.warn('[marketInsight] fetch empty/short', body.length, short);
    }
    return body;
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? 'timeout' : (err?.message || String(err));
    fetchLog.push({ url: short, status: `err:${msg}`, bytes: 0 });
    console.warn('[marketInsight] fetch threw', msg, short);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- EIA ------------------------------------------------------------------

type EiaRow = { period: string; value: number | string | null };

function parseEiaSeries(body: string): Array<[string, number]> | null {
  let j: any;
  try { j = JSON.parse(body); } catch { return null; }
  const rows: EiaRow[] | undefined = j?.response?.data;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // Normalize to [iso_date, close] newest→oldest. Sort ourselves because the
  // API's default ordering isn't guaranteed stable across endpoints.
  const out: Array<[string, number]> = [];
  for (const r of rows) {
    const v = typeof r.value === 'string' ? parseFloat(r.value) : r.value;
    if (typeof r.period !== 'string' || typeof v !== 'number' || !isFinite(v) || v <= 0) continue;
    out.push([r.period, v]);
  }
  if (out.length < 2) return null;
  out.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  return out;
}

function toSeries(rows: Array<[string, number]>): Series {
  // rows[0] is newest. Use index 7 (7 sessions back ≈ 7 calendar days minus
  // weekends — close enough for a weekly delta). Fall back to last available.
  const today = rows[0];
  const prev7 = rows[Math.min(7, rows.length - 1)];
  const prev30 = rows[Math.min(30, rows.length - 1)];
  return {
    today: today[1],
    prev7: prev7[1],
    prev30: prev30[1],
    asOf: today[0],
  };
}

async function fetchEia(seriesId: string, apiKey: string): Promise<Series | null> {
  // seriesid shortcut: the v2 API lets us address legacy series with a single
  // path segment, which is way less noisy than building the facet query.
  const url =
    `https://api.eia.gov/v2/seriesid/${encodeURIComponent(seriesId)}` +
    `?api_key=${encodeURIComponent(apiKey)}&length=60`;
  const body = await fetchWithTimeout(url);
  if (!body) return null;
  const rows = parseEiaSeries(body);
  if (!rows) return null;
  return toSeries(rows);
}

// --- Frankfurter (FX) -----------------------------------------------------

function parseFrankfurterRange(body: string): Array<[string, number]> | null {
  let j: any;
  try { j = JSON.parse(body); } catch { return null; }
  const rates: Record<string, { USD?: number }> | undefined = j?.rates;
  if (!rates) return null;
  const out: Array<[string, number]> = [];
  for (const [date, obj] of Object.entries(rates)) {
    const v = obj?.USD;
    if (typeof v === 'number' && isFinite(v) && v > 0) out.push([date, v]);
  }
  if (out.length < 2) return null;
  out.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  return out;
}

async function fetchFrankfurter(): Promise<Series | null> {
  // Frankfurter's range syntax: `/v1/YYYY-MM-DD..YYYY-MM-DD`. 45-day window
  // ensures we have >= 30 weekday observations.
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 45 * 86400_000).toISOString().slice(0, 10);
  const url = `https://api.frankfurter.dev/v1/${start}..${end}?base=EUR&symbols=USD`;
  const body = await fetchWithTimeout(url);
  if (!body) return null;
  const rows = parseFrankfurterRange(body);
  if (!rows) return null;
  return toSeries(rows);
}

async function fetchEcbEurUsd(): Promise<number | null> {
  const xml = await fetchWithTimeout(
    'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
    4000,
  );
  if (!xml) return null;
  const m = xml.match(/currency='USD'\s+rate='([0-9.]+)'/);
  if (!m) return null;
  const rate = parseFloat(m[1]);
  return isFinite(rate) && rate > 0 ? rate : null;
}

// --- Public API -----------------------------------------------------------

export type MarketData = {
  brent: Series | null;       // USD/barrel (EIA PET.RBRTE.D)
  gasoil: Series | null;      // USD/gallon NY Harbor ULSD (EIA PET.EER_EPD2F_PF4_Y35NY_DPG.D, diesel proxy)
  rbob: Series | null;        // USD/gallon NY Harbor RBOB gasoline spot (EIA PET.EER_EPMRU_PF4_Y35NY_DPG.D)
  eurUsd: Series | null;      // EUR→USD (Frankfurter; ECB "today-only" fallback)
};

export async function fetchMarketData(): Promise<MarketData> {
  fetchLog.length = 0;

  const eiaKey = process.env.EIA_API_KEY;
  const oilP = eiaKey
    ? Promise.all([
        fetchEia('PET.RBRTE.D', eiaKey),
        fetchEia('PET.EER_EPD2F_PF4_Y35NY_DPG.D', eiaKey),
        fetchEia('PET.EER_EPMRU_PF4_Y35NY_DPG.D', eiaKey),
      ])
    : Promise.resolve<[null, null, null]>([null, null, null]);

  const [[brent, gasoil, rbob], eurUsd] = await Promise.all([
    oilP,
    fetchFrankfurter(),
  ]);

  if (!eiaKey) {
    fetchLog.push({ url: '(eia skipped)', status: 'no EIA_API_KEY env var', bytes: 0 });
  }

  // FX last-ditch fallback: if Frankfurter failed, pull today's rate from ECB
  // XML. prev7/prev30 stay equal to today → divergence contribution from FX
  // is zero — acceptable for a single day.
  let fxSeries = eurUsd;
  if (!fxSeries) {
    const spot = await fetchEcbEurUsd();
    if (spot) {
      const iso = new Date().toISOString().slice(0, 10);
      fxSeries = { today: spot, prev7: spot, prev30: spot, asOf: iso };
    }
  }

  return { brent, gasoil, rbob, eurUsd: fxSeries };
}
