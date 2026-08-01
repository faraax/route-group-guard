/**
 * Merges hand-written overrides (from `routeGuard.config.js`, or a fully
 * manual Pages Router route list) on top of a folder-derived manifest.
 *
 * An override matches an existing manifest entry by exact `path` string and
 * *replaces it entirely* (no deep merge — predictable beats clever here).
 * An override with no matching manifest entry is appended as a new route,
 * which is what makes Pages Router support work: pass `manifest: []` and
 * put your whole route list in `overrides`.
 *
 * @param {Array<{path: string}>} manifest
 * @param {Array<{path: string}>} [overrides]
 * @returns {Array<object>}
 */
export function mergeOverrides(manifest, overrides = []) {
  const byPath = new Map(manifest.map((route) => [route.path, route]));

  for (const override of overrides) {
    byPath.set(override.path, {
      access: undefined,
      roles: [],
      permissions: [],
      ...override,
    });
  }

  return [...byPath.values()];
}
