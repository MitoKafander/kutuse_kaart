// Per-country preferences: which countries' stations are hidden from the map,
// and which country the user is in — their map home view, Avastuskaart,
// Avastajad board and market insight all follow it (phase 65).
//
// Both are device-level defaults that get overridden by the signed-in profile
// when one loads, mirroring how every other Kyts preference behaves.

import { COUNTRIES, COUNTRY_CODES, DEFAULT_COUNTRY, countryForCoords, isCountryCode, type CountryCode } from '../constants/countries';

export const HIDDEN_COUNTRIES_KEY = 'kyts-hidden-countries';
export const ACTIVE_COUNTRY_KEY = 'kyts-active-country';
/** Phase 27's single boolean. Read once for migration, still written for old bundles. */
export const LEGACY_SHOW_LV_KEY = 'kyts-show-latvian-stations';

export function sanitizeHiddenCountries(value: unknown): CountryCode[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<CountryCode>();
  for (const v of value) if (isCountryCode(v)) seen.add(v);
  return COUNTRY_CODES.filter((c) => seen.has(c));
}

/**
 * Device default for hidden countries. Migrates the phase-27 boolean: someone
 * who had switched Latvian stations off keeps them off, everyone else starts
 * with every country visible — including the two that just appeared, because
 * the point of the expansion is that they show up.
 */
export function readHiddenCountries(): CountryCode[] {
  try {
    const raw = localStorage.getItem(HIDDEN_COUNTRIES_KEY);
    if (raw) return sanitizeHiddenCountries(JSON.parse(raw));
    if (localStorage.getItem(LEGACY_SHOW_LV_KEY) === 'false') return ['LV'];
  } catch { /* private mode / quota */ }
  return [];
}

export function writeHiddenCountries(hidden: CountryCode[]) {
  try {
    localStorage.setItem(HIDDEN_COUNTRIES_KEY, JSON.stringify(hidden));
    // Keep the phase-27 key coherent so an installed PWA still running the old
    // bundle doesn't disagree with the new one about Latvia.
    localStorage.setItem(LEGACY_SHOW_LV_KEY, String(!hidden.includes('LV')));
  } catch { /* private mode / quota */ }
}

/**
 * Sign-out reset. Clears the profile-synced visibility preference (as
 * show_latvian_stations always was) but deliberately KEEPS the active country,
 * for the same reason `theme` is kept: it's a device-level fact about where
 * this phone is, not an account setting. Wiping it would bounce an anonymous
 * Latvian user back to Estonia's map on every single page load.
 */
export function clearCountryPrefs() {
  try {
    localStorage.removeItem(HIDDEN_COUNTRIES_KEY);
    localStorage.removeItem(LEGACY_SHOW_LV_KEY);
  } catch { /* private mode / quota */ }
}

/**
 * The user's country: it picks the map's home view, which Avastuskaart they
 * see, which Avastajad board they're ranked on, and which country's market
 * insight they read. An explicit choice wins; otherwise we guess from their
 * last known position, so a Latvian driver opens onto Latvia rather than
 * Estonia. Estonia stays the fallback.
 */
export function readActiveCountry(coords?: { lat: number; lon: number } | null): CountryCode {
  try {
    const stored = localStorage.getItem(ACTIVE_COUNTRY_KEY);
    if (isCountryCode(stored)) return stored;
  } catch { /* private mode */ }
  if (coords) {
    const guess = countryForCoords(coords.lat, coords.lon);
    if (guess) return guess;
  }
  return countryFromBrowserLanguage() ?? DEFAULT_COUNTRY;
}

/**
 * Best guess from the browser's language list, used before geolocation is
 * available — which on a first visit is always, since the map only starts
 * locating once permission has already been granted.
 *
 * Without this a Latvian got a Latvian *interface* (i18next reads the same
 * navigator.languages) laid over an Estonian map, Estonian statistics and
 * Estonia's 78 vallad — the one combination guaranteed to look broken. Matches
 * on the language subtag against each country's preferredLocale, so 'lv-LV'
 * and 'lv' both resolve; a region subtag wins outright ('lt-LT').
 */
export function countryFromBrowserLanguage(): CountryCode | null {
  let langs: readonly string[] = [];
  try {
    langs = navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
  } catch { return null; }
  for (const raw of langs) {
    const tag = raw.toLowerCase();
    const region = tag.split('-')[1];
    if (region) {
      const byRegion = COUNTRY_CODES.find((c) => c.toLowerCase() === region);
      if (byRegion) return byRegion;
    }
    const base = tag.split('-')[0];
    const byLocale = COUNTRY_CODES.find((c) => COUNTRIES[c].preferredLocale === base);
    if (byLocale) return byLocale;
  }
  return null;
}

export function writeActiveCountry(country: CountryCode) {
  try { localStorage.setItem(ACTIVE_COUNTRY_KEY, country); } catch { /* private mode */ }
}
