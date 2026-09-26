// Lets Node import the app's TypeScript modules directly.
//
// Vite resolves extensionless relative imports ('./constants/countries'); the
// Node ESM loader does not, so a script that imports src/utils.ts dies on the
// first internal import. This hook appends .ts when a relative specifier has no
// extension, which is enough to load the app's pure modules in a plain Node
// script — used by scripts/verify_currency_rendering.mjs so the gate tests the
// real formatters rather than a copy that can silently drift.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      // Fall through: not every extensionless import is a .ts file.
    }
  }
  return next(specifier, context);
}
