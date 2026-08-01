/**
 * Parses the naming convention used inside Next.js Route Group folders,
 * e.g. `(public)`, `(private)`, `(ADMIN)`, `(ADMIN+MANAGER)`, `(perm:billing)`.
 *
 * Convention (case-sensitive on purpose, to avoid silent typos being
 * treated as a brand-new role):
 *
 *   (public)                -> access: 'public'
 *   (private)                -> access: 'private'
 *   (ADMIN)                  -> roles: ['ADMIN']
 *   (ADMIN+MANAGER)          -> roles: ['ADMIN', 'MANAGER']   (ANY of these)
 *   (perm:manage_billing)    -> permissions: ['manage_billing']
 *   (perm:manage_billing+view_reports) -> permissions: [...]  (ANY of these)
 *
 * Anything that isn't literally `public` or `private`, and doesn't start
 * with `perm:`, is assumed to be one or more role names.
 */

const RESERVED = new Set(['public', 'private']);
const PERM_PREFIX = 'perm:';

/**
 * @param {string} rawSegmentName - folder name WITHOUT the parentheses,
 *   e.g. "private" from "(private)".
 * @returns {{ access?: 'public'|'private', roles?: string[], permissions?: string[] }}
 */
export function parseGroupSegment(rawSegmentName) {
  const name = rawSegmentName.trim();

  if (name.length === 0) {
    return {};
  }

  if (RESERVED.has(name)) {
    return { access: name };
  }

  if (name.startsWith(PERM_PREFIX)) {
    const list = name
      .slice(PERM_PREFIX.length)
      .split('+')
      .map((p) => p.trim())
      .filter(Boolean);
    return list.length > 0 ? { permissions: list } : {};
  }

  const roles = name
    .split('+')
    .map((r) => r.trim())
    .filter(Boolean);

  return roles.length > 0 ? { roles } : {};
}

/**
 * Folds a new segment's metadata into an accumulator while walking a path
 * from the app root down to a page file.
 *
 * Rules (documented in the README under "How nesting combines"):
 *   - `access` is a simple override: the deepest (public)/(private) wins.
 *   - `roles` and `permissions` accumulate (union, de-duped) as you nest
 *     deeper. At check time a user needs ANY one of the accumulated roles
 *     (if roles were specified anywhere on the path) AND ANY one of the
 *     accumulated permissions (if permissions were specified anywhere on
 *     the path). Roles and permissions are independent gates; only the
 *     gates that were actually used on that path apply.
 *
 * @param {{access?: string, roles?: string[], permissions?: string[]}} acc
 * @param {{access?: string, roles?: string[], permissions?: string[]}} next
 */
export function mergeMeta(acc, next) {
  const merged = {
    access: acc.access,
    roles: acc.roles ? [...acc.roles] : [],
    permissions: acc.permissions ? [...acc.permissions] : [],
  };

  if (next.access) {
    merged.access = next.access;
  }
  if (next.roles) {
    for (const r of next.roles) {
      if (!merged.roles.includes(r)) merged.roles.push(r);
    }
  }
  if (next.permissions) {
    for (const p of next.permissions) {
      if (!merged.permissions.includes(p)) merged.permissions.push(p);
    }
  }

  return merged;
}

/**
 * @returns {{access: undefined, roles: [], permissions: []}}
 */
export function emptyMeta() {
  return { access: undefined, roles: [], permissions: [] };
}

/**
 * True if a folder segment name looks like a route group, e.g. "(public)".
 * @param {string} segment - a raw path segment, e.g. "(public)" or "blog".
 */
export function isRouteGroupSegment(segment) {
  return segment.startsWith('(') && segment.endsWith(')') && segment.length > 2;
}

/**
 * Strip the parentheses off a route-group segment: "(private)" -> "private".
 */
export function stripGroupParens(segment) {
  return segment.slice(1, -1);
}
