// Station-level exclusion rules shared by the seeder (skip on import) and the
// cleanup script (deactivate what an earlier seed let through). One regex, two
// callers — the seeder alone would leave every already-seeded row wrong, and
// the cleanup alone would let the next seed re-import them.

/**
 * A name that says the forecourt is closed. OSM mappers who find a dead
 * station often rename it rather than retag it, so `amenity=fuel` stays and
 * the name carries the fact: Poland had five "Nieczynna …" ("closed …") rows
 * on the live map after its seed. Word stems so inflections match; every
 * Kyts language plus the neighbours' spellings, checked against the catalog
 * (only Polish had any) but cheap to keep for the next country.
 */
export const CLOSED_NAME_RE =
  /\b(nieczynn|zamknięt|suletud|suljettu|stängd|nedlag[dt]|slēgt|uždaryt|closed)/i;

export function closedNameReason(name) {
  return name && CLOSED_NAME_RE.test(name) ? 'closed (per its name)' : null;
}
