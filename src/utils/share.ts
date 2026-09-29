// Sharing a station.
//
// The growth plan's "cheap 80% of virality" (Notes/CROWD_GROWTH_PLAN.md §3,
// move 4): every contributor becomes a distributor. A plain `navigator.share`
// with a link that opens the station, tagged `ref=share` so its effect shows up
// in PostHog; the clipboard where the native sheet does not exist (desktop).
//
// The link is handled at boot in App.tsx (`?station=`), which opens the
// station's drawer — a shared link that dropped people on the national map
// would waste the one visit it earns.

import type { TFunction } from 'i18next';
import { capture } from './analytics';
import { getStationDisplayName, isPriceExpired, fuelLabel, formatPrice } from '../utils';
import { currencyForCountry } from '../constants/countries';

const FUELS = ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG'];

export function stationShareUrl(stationId: string | number): string {
  return `${window.location.origin}/?station=${encodeURIComponent(String(stationId))}&ref=share`;
}

/** "Circle K (Tallinn, Pärnu mnt): 95 €1.959 · Diesel €2.039 — see it on Kyts" */
export function stationShareText(station: any, prices: any[], votes: any[], t: TFunction): string {
  const currency = currencyForCountry(station?.country);
  const parts: string[] = [];
  for (const fuel of FUELS) {
    const latest = prices
      .filter((p) => String(p.station_id) === String(station.id) && p.fuel_type === fuel)
      .sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())[0];
    // An expired price is not something to send a friend to.
    if (!latest || isPriceExpired(latest, votes)) continue;
    parts.push(`${fuelLabel(fuel, t)} ${formatPrice(latest.price, currency)}`);
  }
  const name = getStationDisplayName(station);
  return parts.length
    ? t('share.stationWithPrices', { name, prices: parts.join(' · ') })
    : t('share.stationNoPrices', { name });
}

export type ShareOutcome = 'native' | 'copied' | 'cancelled' | 'failed';

export async function shareStation(opts: {
  station: any;
  prices: any[];
  votes: any[];
  t: TFunction;
  /** Where the share started — the question the numbers need to answer is which one works. */
  context: 'drawer' | 'post_submit';
}): Promise<ShareOutcome> {
  const { station, prices, votes, t, context } = opts;
  const url = stationShareUrl(station.id);
  const text = stationShareText(station, prices, votes, t);
  let outcome: ShareOutcome = 'failed';
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: 'Kyts', text, url });
      outcome = 'native';
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      outcome = 'copied';
    }
  } catch (e: any) {
    // The user closing the share sheet is not an error worth reporting.
    outcome = e?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
  capture('share_clicked', { context, outcome, country: station?.country ?? null });
  return outcome;
}

// The post-submit share toast shows at most once a calendar day per device.
// Heavy contributors price several forecourts a day; asking after every one
// would turn a nudge into noise.
const NUDGE_KEY = 'kyts:share-nudge-last';
const today = () => new Date().toISOString().slice(0, 10);

export function shareNudgeDue(): boolean {
  try { return localStorage.getItem(NUDGE_KEY) !== today(); } catch { return false; }
}

export function markShareNudgeShown(): void {
  try { localStorage.setItem(NUDGE_KEY, today()); } catch { /* private mode */ }
}
