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
export function defineConfig(overrides) {
  return overrides;
}
