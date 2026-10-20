import { NextResponse } from 'next/server';
import { createMatcher } from './manifest/matcher.js';
import { mergeOverrides } from './config/mergeOverrides.js';
import { resolveSession } from './auth/token.js';
import { checkAccess } from './auth/access.js';

const DEFAULT_REDIRECTS = { login: '/login', home: '/' };

/**
 * @typedef {import('./manifest/matcher.js').ManifestRoute} ManifestRoute
 *
 * @typedef {Object} RouteGuardOptions
 * @property {ManifestRoute[]|{routes: ManifestRoute[]}} [manifest] - the
 *   generated manifest. Pass the whole statically-imported module
 *   (`import manifest from './route-guard.manifest.json'`) or just its
 *   `.routes` array — both work. Omit (or pass []) for a pure Pages-Router
 *   / fully-manual setup and rely on `overrides` alone.
 * @property {import('./config/defineConfig.js').RouteOverride[]} [overrides] -
 *   hand-written rules (from `routeGuard.config.js`) merged on top of
 *   `manifest`, matched by exact path. Also how Pages Router apps define
 *   their whole route list.
 * @property {string} [cookieName='auth_token']
 * @property {'public'|'private'} [defaultAccess='private'] - applied to any
 *   route that isn't inside a (public)/(private) group and has no override.
 * @property {{login?: string, home?: string, unauthorized?: string}} [redirects]
 * @property {string[]} [redirectAuthenticatedFrom] - exact paths (e.g. ['/login'])
 *   that an *authenticated* visitor should be bounced away from.
 * @property {(cookies: any, cookieName: string) => string|null} [getToken]
 * @property {(raw: string) => object|null} [decodeToken]
 * @property {(payload: object|null) => boolean} [verifyToken]
 * @property {(payload: object|null) => string|string[]|undefined} [getRole]
 * @property {(payload: object|null) => string[]} [getPermissions]
 * @property {(role: string|string[]|undefined, session: object) => string|undefined} [getRoleHome] -
 *   mirrors the common "redirect wrong-role users to *their* dashboard"
 *   pattern. Takes priority over `redirects.unauthorized` when it returns a value.
 * @property {(req: any, session: object) => any} [onUnauthenticated] - return a
 *   NextResponse to fully override the default redirect.
 * @property {(req: any, session: object, route: ManifestRoute) => any} [onUnauthorized]
 */

/**
 * Builds a ready-to-export Next.js middleware function.
 *
 * ```js
 * // middleware.js
 * import { createRouteGuardMiddleware } from 'route-group-guard';
 * import manifest from './route-guard.manifest.json';
 *
 * export default createRouteGuardMiddleware({ manifest });
 *
 * export const config = {
 *   matcher: ['/((?!_next|api|favicon.ico|public|images).*)'],
 * };
 * ```
 *
 * @param {RouteGuardOptions} [options]
 * @returns {(req: import('next/server').NextRequest) => import('next/server').NextResponse}
 */
function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

const CALLBACK_NAMES = [
  'getToken',
  'decodeToken',
  'verifyToken',
  'getRole',
  'getPermissions',
  'getRoleHome',
  'onUnauthenticated',
  'onUnauthorized',
];

export function createRouteGuardMiddleware(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('createRouteGuardMiddleware: options must be a plain object');
  }

  if (options.manifest !== undefined) {
    if (
      typeof options.manifest !== 'object' ||
      options.manifest === null ||
      (!Array.isArray(options.manifest) && !Array.isArray(options.manifest.routes))
    ) {
      throw new TypeError('createRouteGuardMiddleware: manifest must be an array or an object with a "routes" array');
    }
  }

  if (options.overrides !== undefined) {
    if (
      typeof options.overrides !== 'object' ||
      options.overrides === null ||
      (!Array.isArray(options.overrides) && !Array.isArray(options.overrides.routes))
    ) {
      throw new TypeError('createRouteGuardMiddleware: overrides must be an array or an object with a "routes" array');
    }
  }

  if (options.cookieName !== undefined) {
    if (typeof options.cookieName !== 'string' || options.cookieName.trim() === '') {
      throw new TypeError('createRouteGuardMiddleware: cookieName must be a non-empty string');
    }
  }

  if (options.defaultAccess !== undefined) {
    if (options.defaultAccess !== 'public' && options.defaultAccess !== 'private') {
      throw new TypeError('createRouteGuardMiddleware: defaultAccess must be "public" or "private"');
    }
  }

  if (options.redirects !== undefined) {
    if (!isPlainObject(options.redirects)) {
      throw new TypeError('createRouteGuardMiddleware: redirects must be a plain object');
    }
  }

  if (options.redirectAuthenticatedFrom !== undefined) {
    if (!Array.isArray(options.redirectAuthenticatedFrom)) {
      throw new TypeError('createRouteGuardMiddleware: redirectAuthenticatedFrom must be an array');
    }
  }

  for (const name of CALLBACK_NAMES) {
    if (options[name] !== undefined && typeof options[name] !== 'function') {
      throw new TypeError(`createRouteGuardMiddleware: ${name} must be a function`);
    }
  }

  const {
    manifest = [],
    overrides,
    cookieName = 'auth_token',
    defaultAccess = 'private',
    redirects = {},
    redirectAuthenticatedFrom = [],
    getToken,
    decodeToken,
    verifyToken,
    getRole,
    getPermissions,
    getRoleHome,
    onUnauthenticated,
    onUnauthorized,
  } = options;

  const resolvedRedirects = { ...DEFAULT_REDIRECTS, ...redirects };
  const finalRoutes = mergeOverrides(manifest, overrides);
  const matcher = createMatcher(finalRoutes);

  return function routeGuardMiddleware(req) {
    const { nextUrl, cookies } = req;
    const pathname = nextUrl.pathname;

    const matched = matcher.match(pathname);
    const route = matched ?? { access: undefined, roles: [], permissions: [] };

    const session = resolveSession(cookies, {
      cookieName,
      getToken,
      decodeToken,
      verifyToken,
      getRole,
      getPermissions,
    });

    const decision = checkAccess(route, session, defaultAccess);

    if (decision.allowed) {
      if (session.isAuthenticated && redirectAuthenticatedFrom.includes(pathname)) {
        const target = (getRoleHome && getRoleHome(session.role, session)) || resolvedRedirects.home;
        const targetPath = new URL(target, req.url).pathname;
        if (targetPath === pathname) {
          return NextResponse.next();
        }
        return NextResponse.redirect(new URL(target, req.url));
      }
      return NextResponse.next();
    }

    if (decision.reason === 'unauthenticated') {
      if (onUnauthenticated) {
        const custom = onUnauthenticated(req, session);
        if (custom) return custom;
      }
      const loginPath = new URL(resolvedRedirects.login, req.url).pathname;
      if (loginPath === pathname) {
        console.warn(
          `[route-group-guard] Redirect loop detected: unauthenticated login redirect "${resolvedRedirects.login}" matches current path "${pathname}". Passing through to prevent infinite redirect loop.`
        );
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL(resolvedRedirects.login, req.url));
    }

    // decision.reason is 'role' or 'permission'
    if (onUnauthorized) {
      const custom = onUnauthorized(req, session, route);
      if (custom) return custom;
    }
    const fallback =
      (getRoleHome && getRoleHome(session.role, session)) || resolvedRedirects.unauthorized || resolvedRedirects.home;
    const fallbackPath = new URL(fallback, req.url).pathname;
    if (fallbackPath === pathname) {
      console.warn(
        `[route-group-guard] Redirect loop detected: unauthorized redirect "${fallback}" matches current path "${pathname}". Passing through to prevent infinite redirect loop.`
      );
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL(fallback, req.url));
  };
}
