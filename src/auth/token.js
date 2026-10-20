import { jwtDecode } from 'jwt-decode';

/**
 * IMPORTANT SECURITY NOTE
 * ------------------------
 * `jwt-decode` (like the original hand-written middleware this package
 * replaces) only *decodes* a JWT's payload — it does NOT verify the
 * cryptographic signature. That's fine for what middleware needs to do
 * (a fast, cheap "is this worth letting through to the app" check), as
 * long as your actual API/backend independently verifies the signature on
 * every request that matters. Do not treat a passing middleware check as
 * proof the token is genuine.
 *
 * If you need real signature verification at the edge (not just expiry),
 * pass a custom `verifyToken` — the `jose` package supports signature
 * verification in the Edge runtime (unlike `jsonwebtoken`, which needs
 * Node's `crypto` module and will not run in middleware).
 */

/** @param {import('next/server').RequestCookies} cookies */
export function defaultGetToken(cookies, cookieName) {
  return cookies.get(cookieName)?.value ?? null;
}

/**
 * Decodes the raw cookie value into a JWT payload. Understands two shapes
 * out of the box so it works with this package's default cookie format
 * with zero config:
 *   1. a raw JWT string
 *   2. a JSON string like `{"access": "...", "refresh": "..."}` — decodes
 *      `refresh` if present (matches the common "long-lived token decides
 *      whether the session is still alive" pattern), else `access`/`token`.
 */
export function defaultDecodeToken(rawCookieValue) {
  let tokenString = rawCookieValue;

  try {
    const parsed = JSON.parse(rawCookieValue);
    if (parsed && typeof parsed === 'object') {
      tokenString = parsed.refresh ?? parsed.access ?? parsed.token ?? null;
    }
  } catch {
    // Not JSON — assume rawCookieValue is already the raw JWT string.
  }

  if (!tokenString) return null;

  try {
    return jwtDecode(tokenString);
  } catch {
    // Malformed JWT — return null instead of throwing so this function
    // is safe to call standalone (outside resolveSession's try/catch).
    return null;
  }
}

/**
 * @param {{exp?: number}|null} payload
 * @param {number} [clockToleranceSec=60] — seconds of leeway to handle
 *   minor clock skew between the token issuer and this server. Standard
 *   JWT libraries default to 60 s; set to 0 for strict checking.
 */
export function defaultVerifyToken(payload, clockToleranceSec = 60) {
  if (!payload || typeof payload.exp !== 'number') return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp + clockToleranceSec > nowSec;
}

/** @param {Record<string, unknown>|null} payload */
export function defaultGetRole(payload) {
  return payload?.role;
}

/** @param {Record<string, unknown>|null} payload */
export function defaultGetPermissions(payload) {
  return Array.isArray(payload?.permissions) ? payload.permissions : [];
}

/**
 * Runs the full extract -> decode -> verify -> read-claims pipeline.
 * Never throws: a malformed, tampered, or missing cookie just resolves to
 * "not authenticated" rather than crashing the middleware.
 *
 * @param {import('next/server').RequestCookies} cookies
 * @param {{
 *   cookieName: string,
 *   getToken?: typeof defaultGetToken,
 *   decodeToken?: typeof defaultDecodeToken,
 *   verifyToken?: typeof defaultVerifyToken,
 *   getRole?: typeof defaultGetRole,
 *   getPermissions?: typeof defaultGetPermissions,
 * }} options
 * @returns {{ isAuthenticated: boolean, role: string|undefined, permissions: string[], payload: object|null }}
 */
export function resolveSession(cookies, options) {
  const {
    cookieName,
    getToken = defaultGetToken,
    decodeToken = defaultDecodeToken,
    verifyToken = defaultVerifyToken,
    getRole = defaultGetRole,
    getPermissions = defaultGetPermissions,
  } = options;

  try {
    const raw = getToken(cookies, cookieName);
    if (!raw) {
      return { isAuthenticated: false, role: undefined, permissions: [], payload: null };
    }

    const payload = decodeToken(raw);
    if (!verifyToken(payload)) {
      return { isAuthenticated: false, role: undefined, permissions: [], payload: null };
    }

    return {
      isAuthenticated: true,
      role: getRole(payload),
      permissions: getPermissions(payload),
      payload,
    };
  } catch {
    return { isAuthenticated: false, role: undefined, permissions: [], payload: null };
  }
}
