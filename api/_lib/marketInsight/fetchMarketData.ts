// Market-data fetchers for the daily Kyts insight cron.
//
// All sources are free and keyless:
//   · Stooq serves daily-close CSV for futures + FX. Format:
//       Date,Open,High,Low,Close,Volume
//       2026-04-18,82.10,82.45,81.80,82.12,...
//   · ECB publishes the daily EUR/USD reference rate as a tiny XML feed
//     (used only as a fallback when Stooq is flaky).
//
// Each fetch is wrapped in a 5 s AbortController timeout so a single slow
// source can't starve the 60 s Serverless budget. On any failure we return
// null — the signal algorithm gracefully degrades to `neutral` when a
// benchmark is missing, rather than crashing the whole run.

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
      headers: { 'User-Agent': 'kyts-market-insight/1.0 (+https://kyts.ee)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Parse Stooq CSV, return last N closes as [date, close] tuples (newest first).
function parseStooqCsv(csv: string): Array<[string, number]> | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 3) return null;
  const header = lines[0].toLowerCase();
  if (!header.includes('date') || !header.includes('close')) return null;

  const dateIdx = header.split(',').indexOf('date');
  const closeIdx = header.split(',').indexOf('close');
  if (dateIdx < 0 || closeIdx < 0) return null;

  const out: Array<[string, number]> = [];
  for (let i = lines.length - 1; i >= 1 && out.length < 60; i--) {
    const cols = lines[i].split(',');
    const date = cols[dateIdx];
    const close = parseFloat(cols[closeIdx]);
    if (date && isFinite(close) && close > 0) out.push([date, close]);
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

async function fetchStooq(symbol: string): Promise<Series | null> {
  // Stooq daily-close CSV. The `i=d` param means daily; default window is
  // the full history but we only parse the tail.
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
  const csv = await fetchWithTimeout(url);
  if (!csv) return null;
  const rows = parseStooqCsv(csv);
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
  brent: Series | null;       // USD/barrel
  gasoil: Series | null;      // USD/tonne (ICE Low-Sulphur Gasoil, proxy for Rotterdam diesel)
  rbob: Series | null;        // USD/gallon (NYMEX RBOB, proxy for Rotterdam gasoline)
  eurUsd: Series | null;      // EUR→USD (from Stooq; ECB fallback writes a flat "today" only)
};

export async function fetchMarketData(): Promise<MarketData> {
  const [brent, gasoil, rbob, eurUsd] = await Promise.all([
    fetchStooq('cb.f'),
    fetchStooq('lgo.f'),
    fetchStooq('rb.f'),
    fetchStooq('eurusd'),
  ]);

  // If Stooq EUR/USD failed, backfill "today" from ECB so at least today's
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
