// Market-data fetchers for the daily Kyts insight cron.
//
// All sources are free and keyless:
//   · Yahoo Finance v8 chart API serves daily closes for futures + FX as JSON.
//     We were originally on Stooq, but Stooq started responding with an empty
//     body + `Content-disposition: attachment;filename=error.txt` to every
//     request (regardless of UA), so it's effectively broken for us.
//   · ECB publishes the daily EUR/USD reference rate as a tiny XML feed
//     (used only as a fallback when Yahoo FX is flaky).
//
// Each fetch is wrapped in a 5 s AbortController timeout so a single slow
// source can't starve the 60 s Serverless budget. On any failure we return
// null — the signal algorithm gracefully degrades to `neutral` when a
// benchmark is missing, rather than crashing the whole run.
//
// Symbol choices:
//   · BZ=F  — ICE Brent Crude (USD/bbl), headline oil price
//   · HO=F  — NY Harbor ULSD / Heating Oil futures (USD/gal). This is the
//             diesel-wholesale proxy. The ideal benchmark is ICE Low-Sulphur
//             Gasoil (LGO) which is what Rotterdam traders actually watch,
//             but Yahoo doesn't carry LGO. HO=F tracks LGO with ~0.95
//             correlation on daily moves, so directionally it's fine for a
//             buy-now/wait signal.
//   · RB=F  — NYMEX RBOB gasoline (USD/gal), direct wholesale proxy
//   · EURUSD=X — EUR→USD spot for converting USD wholesale into EUR terms

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

async function fetchWithTimeout(url: string, ms = 5000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        'Accept': 'application/json,text/xml,*/*',
      },
    });
    if (!res.ok) {
      console.warn('[marketInsight] fetch non-ok', res.status, url.slice(0, 80));
      return null;
    }
    const body = await res.text();
    if (!body || body.length < 50) {
      console.warn('[marketInsight] fetch empty/short', body.length, url.slice(0, 80));
    }
    return body;
  } catch (err: any) {
    console.warn('[marketInsight] fetch threw', err?.message || err, url.slice(0, 80));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Parse Yahoo v8 chart JSON into [date, close] tuples (newest first). Yahoo
// occasionally returns null slots inside `close` for holidays/bad days — we
// drop those.
function parseYahooChart(body: string): Array<[string, number]> | null {
  let j: any;
  try { j = JSON.parse(body); } catch { return null; }
  const result = j?.chart?.result?.[0];
  if (!result) return null;
  const ts: number[] = result.timestamp;
  const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(closes)) return null;

  const out: Array<[string, number]> = [];
  for (let i = ts.length - 1; i >= 0 && out.length < 60; i--) {
    const c = closes[i];
    const t = ts[i];
    if (typeof c !== 'number' || !isFinite(c) || c <= 0) continue;
    const iso = new Date(t * 1000).toISOString().slice(0, 10);
    out.push([iso, c]);
  }
  return out.length >= 2 ? out : null;
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

async function fetchYahoo(symbol: string): Promise<Series | null> {
  // `range=2mo` gives us ~40 trading sessions — more than enough to pick a
  // prev30 index. `interval=1d` is the daily close we actually want.
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=2mo`;
  const body = await fetchWithTimeout(url);
  if (!body) return null;
  const rows = parseYahooChart(body);
  if (!rows) return null;
  return toSeries(rows);
}

async function fetchEcbEurUsd(): Promise<number | null> {
  // ECB daily reference rate XML — the official EUR fx rate published ~16:00 CET.
  // We only need today's number; history is 30 days in a separate feed we don't use.
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

export type MarketData = {
  brent: Series | null;       // USD/barrel (Yahoo BZ=F)
  gasoil: Series | null;      // USD/gallon heating oil (Yahoo HO=F, diesel proxy)
  rbob: Series | null;        // USD/gallon NYMEX RBOB (Yahoo RB=F, gasoline proxy)
  eurUsd: Series | null;      // EUR→USD (Yahoo EURUSD=X; ECB fallback writes a flat "today" only)
};

export async function fetchMarketData(): Promise<MarketData> {
  const [brent, gasoil, rbob, eurUsd] = await Promise.all([
    fetchYahoo('BZ=F'),
    fetchYahoo('HO=F'),
    fetchYahoo('RB=F'),
    fetchYahoo('EURUSD=X'),
  ]);

  // If Yahoo EUR/USD failed, backfill "today" from ECB so at least today's
  // currency conversion doesn't blow up. prev7/prev30 stay equal to today,
  // which means divergence contribution from FX is zero — acceptable.
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
