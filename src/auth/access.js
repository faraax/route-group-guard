/**
 * Pure decision function: given a route's requirements and the caller's
 * session, decide whether the request is allowed through. No Next.js
 * types here on purpose — easy to unit test in isolation.
 *
 * @param {{access?: 'public'|'private', roles?: string[], permissions?: string[], roleMode?: 'any'|'all', permissionMode?: 'any'|'all'}} route
 * @param {{isAuthenticated: boolean, role?: string|string[], permissions?: string[]}} session
 * @param {'public'|'private'} defaultAccess - used when `route.access` is undefined
 *   (i.e. the path wasn't inside any (public)/(private) group).
 * @returns {{ allowed: boolean, reason?: 'unauthenticated'|'role'|'permission' }}
 */
export function checkAccess(route, session, defaultAccess) {
  const access = route.access ?? defaultAccess;

  if (access === 'public') {
    return { allowed: true };
  }

  if (!session.isAuthenticated) {
    return { allowed: false, reason: 'unauthenticated' };
  }

  const roles = route.roles ?? [];
  if (roles.length > 0) {
    const userRoles = Array.isArray(session.role)
      ? session.role
      : session.role
        ? [session.role]
        : [];
    const mode = route.roleMode ?? 'any';
    const hasRole =
      mode === 'all' ? roles.every((r) => userRoles.includes(r)) : roles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      return { allowed: false, reason: 'role' };
    }
  }

  const permissions = route.permissions ?? [];
  if (permissions.length > 0) {
    const userPermissions = session.permissions ?? [];
    const mode = route.permissionMode ?? 'any';
    const hasPermission =
      mode === 'all'
        ? permissions.every((p) => userPermissions.includes(p))
        : permissions.some((p) => userPermissions.includes(p));
    if (!hasPermission) {
      return { allowed: false, reason: 'permission' };
    }
  }

  return { allowed: true };
}
