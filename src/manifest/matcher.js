/**
 * Turns manifest route paths (which may contain Next.js dynamic segments)
 * into a fast, specificity-ordered matcher for an incoming pathname.
 *
 * Segment kinds, in the same precedence order Next.js itself uses when
 * multiple pattern types could apply to the same URL:
 *   static            /about               highest precedence
 *   dynamic           /blog/[slug]
 *   catch-all         /docs/[...slug]
 *   optional catch-all /shop/[[...filters]] lowest precedence (also matches
 *                                            the parent path with 0 segments)
 */

const SEGMENT_WEIGHT = {
  static: 3,
  dynamic: 2,
  catchAll: 1,
  optionalCatchAll: 0,
};

function classifySegment(segment) {
  if (segment.startsWith('[[...') && segment.endsWith(']]')) return 'optionalCatchAll';
  if (segment.startsWith('[...') && segment.endsWith(']')) return 'catchAll';
  if (segment.startsWith('[') && segment.endsWith(']')) return 'dynamic';
  return 'static';
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} routePath - e.g. "/blog/[slug]" or "/shop/[[...filters]]"
 * @returns {{ regex: RegExp, paramNames: string[], paramKinds: string[], score: number, segmentCount: number }}
 */
function compileRoute(routePath) {
  const rawSegments = routePath.split('/').filter(Boolean);

  if (rawSegments.length === 0) {
    return {
      regex: /^\/$/,
      paramNames: [],
      paramKinds: [],
      score: Number.MAX_SAFE_INTEGER,
      segmentCount: 0,
    };
  }

  let pattern = '^';
  let score = 0;
  const paramNames = [];
  const paramKinds = [];

  rawSegments.forEach((segment, index) => {
    const kind = classifySegment(segment);
    score += SEGMENT_WEIGHT[kind] * 10000 - index; // earlier static segments count slightly more

    if (kind === 'optionalCatchAll') {
      const name = segment.slice(5, -2); // strip "[[..." and "]]"
      paramNames.push(name);
      paramKinds.push(kind);
      pattern += '(?:/(.*))?';
    } else if (kind === 'catchAll') {
      const name = segment.slice(4, -1); // strip "[..." and "]"
      paramNames.push(name);
      paramKinds.push(kind);
      pattern += '/(.+)';
    } else if (kind === 'dynamic') {
      const name = segment.slice(1, -1);
      paramNames.push(name);
      paramKinds.push(kind);
      pattern += '/([^/]+)';
    } else {
      pattern += '/' + escapeRegex(segment);
    }
  });

  pattern += '$';

  return { regex: new RegExp(pattern), paramNames, paramKinds, score, segmentCount: rawSegments.length };
}

/**
 * @typedef {Object} ManifestRoute
 * @property {string} path
 * @property {'public'|'private'|undefined} access
 * @property {string[]} roles
 * @property {string[]} permissions
 */

/**
 * @param {ManifestRoute[]} routes
 * @returns {{ match: (pathname: string) => (ManifestRoute & {params: Record<string,string>}) | null }}
 */
export function createMatcher(routes) {
  const compiledRoutes = routes
    .map((route) => ({ route, compiled: compileRoute(route.path) }))
    .sort((a, b) => b.compiled.score - a.compiled.score);

  function match(pathname) {
    let decoded = pathname;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      // Malformed percent-encoding (e.g. /%ZZ) - fall back to raw pathname
    }

    const normalized = decoded.length > 1 && decoded.endsWith('/')
      ? decoded.slice(0, -1)
      : decoded;

    for (const { route, compiled } of compiledRoutes) {
      const result = compiled.regex.exec(normalized);
      if (!result) continue;

      const params = {};
      compiled.paramNames.forEach((name, i) => {
        const raw = result[i + 1];
        if (raw === undefined) return;
        const kind = compiled.paramKinds[i];
        params[name] = kind === 'dynamic' ? raw : raw.split('/').filter(Boolean);
      });

      return { ...route, params };
    }

    return null;
  }

  return { match };
}
