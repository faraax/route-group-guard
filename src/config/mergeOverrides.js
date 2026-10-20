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
 * Accepts either a bare array of routes, or the whole object the CLI writes
 * to `route-guard.manifest.json` (`{generatedAt, routeCount, routes}`) —
 * `import manifest from './route-guard.manifest.json'` gets you the latter,
 * and requiring every caller to remember to unwrap `.routes` themselves is
 * exactly the kind of thing that's easy to get wrong once and never notice
 * until routes stop being guarded.
 *
 * @param {Array<{path: string}>|{routes: Array<{path: string}>}} manifest
 * @param {Array<{path: string}>|{routes: Array<{path: string}>}} [overrides]
 * @returns {Array<object>}
 */
export function mergeOverrides(manifest, overrides = []) {
  const routes = normalizeRoutes(manifest);
  const overrideRoutes = normalizeRoutes(overrides);

  const byPath = new Map(routes.map((route) => [route.path, route]));

  for (const override of overrideRoutes) {
    byPath.set(override.path, {
      access: undefined,
      roles: [],
      permissions: [],
      ...override,
    });
  }

  return [...byPath.values()];
}

function normalizeRoutes(input) {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.routes)) return input.routes;
  return [];
}
