/**
 * @typedef {Object} RouteOverride
 * @property {string} path - exact route path, e.g. "/billing" or "/blog/[slug]"
 * @property {'public'|'private'} [access]
 * @property {string[]} [roles]
 * @property {string[]} [permissions]
 * @property {'any'|'all'} [roleMode] - default 'any' (user needs at least one listed role)
 * @property {'any'|'all'} [permissionMode] - default 'any'
 */

/**
 * Identity helper for authoring `routeGuard.config.js`. Its only job is to
 * give you editor autocomplete/JSDoc types on the array you write — it does
 * not read the filesystem, so it's safe to import from Edge middleware:
 *
 * ```js
 * // routeGuard.config.js
 * import { defineConfig } from 'route-group-guard';
 *
 * export default defineConfig([
 *   { path: '/legacy-admin', access: 'private', roles: ['ADMIN'] },
 *   { path: '/billing', access: 'private', permissions: ['view_billing', 'manage_billing'], permissionMode: 'all' },
 * ]);
 * ```
 *
 * This is also how you configure route guarding on the **Pages Router**,
 * where there's no `app/` folder convention to scan: pass your whole route
 * list here and don't pass a `manifest` to `createRouteGuardMiddleware`.
 *
 * @param {RouteOverride[]} overrides
 * @returns {RouteOverride[]}
 */
const KNOWN_KEYS = new Set(['path', 'access', 'roles', 'permissions', 'roleMode', 'permissionMode']);

export function defineConfig(overrides) {
  if (!Array.isArray(overrides)) {
    throw new TypeError('defineConfig expects an array of route override objects');
  }

  for (let i = 0; i < overrides.length; i++) {
    const item = overrides[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new TypeError(`defineConfig: item at index ${i} must be a route override object`);
    }
    if (typeof item.path !== 'string' || item.path.trim() === '') {
      throw new TypeError(`defineConfig: item at index ${i} must have a non-empty string "path"`);
    }

    for (const key of Object.keys(item)) {
      if (!KNOWN_KEYS.has(key)) {
        console.warn(`[route-group-guard] defineConfig: unknown property "${key}" in route override for "${item.path}"`);
      }
    }
  }

  return overrides;
}
