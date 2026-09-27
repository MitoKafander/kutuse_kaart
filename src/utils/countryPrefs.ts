// Which country the user is in. One value, and it decides a lot: the stations
// drawn on the map, the map's home view, which Avastuskaart they collect, which
// Avastajad board ranks them, which country's market insight they read, and
// which currency prices render in.
//
// A device-level default, overridden by the signed-in profile when one loads,
// mirroring every other Kyts preference.
//
// There used to be a second concept here — a list of countries hidden from the
// map — from when every country was drawn at once. The map now shows one
// country, so hiding is meaningless and that half of the module is gone.

import { COUNTRIES, COUNTRY_CODES, DEFAULT_COUNTRY, countryForCoords, isCountryCode, type CountryCode } from '../constants/countries';

export const ACTIVE_COUNTRY_KEY = 'kyts-active-country';




/**
 * Sign-out reset — deliberately a no-op for the active country.
 *
 * It used to clear the per-country visibility preference, which no longer
 * exists now that the map shows one country at a time. The active country is
 * kept for the same reason `theme` is: it is a device-level fact about where
 * this phone is, not an account setting, and wiping it would bounce an
 * anonymous Latvian user back to Estonia's map on every page load.
 *
 * Kept as a named function rather than deleted, because the sign-out path
 * calls it alongside every other pref reset and a future country-scoped
 * preference belongs here.
 */
export function clearCountryPrefs() {
  /* nothing to clear: activeCountry deliberately survives sign-out */
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
