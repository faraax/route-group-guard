import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSession, defaultDecodeToken, defaultVerifyToken } from '../src/auth/token.js';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Hand-crafts a JWT-shaped string. jwt-decode never checks the signature, so "sig" is a placeholder. */
function makeFakeJwt(payload) {
  const header = { alg: 'none', typ: 'JWT' };
  return `${b64url(header)}.${b64url(payload)}.sig`;
}

function mockCookies(map) {
  return {
    get: (name) => (name in map ? { name, value: map[name] } : undefined),
  };
}

/** Helper: current Unix timestamp in seconds */
function nowSec() {
  return Math.floor(Date.now() / 1000);
}

test('resolveSession: no cookie present -> not authenticated', () => {
  const session = resolveSession(mockCookies({}), { cookieName: 'auth_token' });
  assert.deepEqual(session, { isAuthenticated: false, role: undefined, permissions: [], payload: null });
});

test('resolveSession: valid raw JWT string, unexpired', () => {
  const token = makeFakeJwt({
    role: 'ADMIN',
    permissions: ['manage_billing'],
    exp: nowSec() + 3600,
  });
  const session = resolveSession(mockCookies({ auth_token: token }), { cookieName: 'auth_token' });
  assert.equal(session.isAuthenticated, true);
  assert.equal(session.role, 'ADMIN');
  assert.deepEqual(session.permissions, ['manage_billing']);
});

test('resolveSession: JSON {access, refresh} cookie shape decodes the refresh token', () => {
  const refresh = makeFakeJwt({ role: 'DOCTOR', exp: nowSec() + 86400 });
  const access = makeFakeJwt({ role: 'DOCTOR', exp: nowSec() + 300 });
  const cookieValue = JSON.stringify({ access, refresh });
  const session = resolveSession(mockCookies({ auth_token: cookieValue }), { cookieName: 'auth_token' });
  assert.equal(session.isAuthenticated, true);
  assert.equal(session.role, 'DOCTOR');
});

test('resolveSession: expired token -> not authenticated', () => {
  const token = makeFakeJwt({ role: 'ADMIN', exp: nowSec() - 3600 });
  const session = resolveSession(mockCookies({ auth_token: token }), { cookieName: 'auth_token' });
  assert.equal(session.isAuthenticated, false);
});

test('resolveSession: malformed cookie value never throws, resolves to unauthenticated', () => {
  assert.doesNotThrow(() => {
    const session = resolveSession(mockCookies({ auth_token: 'not-a-jwt-at-all' }), {
      cookieName: 'auth_token',
    });
    assert.equal(session.isAuthenticated, false);
  });
});

test('resolveSession: respects a custom cookie name', () => {
  const token = makeFakeJwt({ role: 'ADMIN', exp: nowSec() + 3600 });
  const session = resolveSession(mockCookies({ session_id: token }), { cookieName: 'session_id' });
  assert.equal(session.isAuthenticated, true);
});

test('resolveSession: custom getRole/getPermissions/verifyToken overrides are honored', () => {
  const token = makeFakeJwt({ user: { type: 'MANAGER' }, scopes: 'billing,reports', exp: 0 });
  const session = resolveSession(mockCookies({ auth_token: token }), {
    cookieName: 'auth_token',
    verifyToken: () => true, // override: ignore exp entirely
    getRole: (payload) => payload.user.type,
    getPermissions: (payload) => payload.scopes.split(','),
  });
  assert.equal(session.isAuthenticated, true);
  assert.equal(session.role, 'MANAGER');
  assert.deepEqual(session.permissions, ['billing', 'reports']);
});

// --- New tests for C3: defaultDecodeToken standalone safety ---

test('defaultDecodeToken: returns null (does not throw) for a non-JWT string', () => {
  assert.doesNotThrow(() => {
    const result = defaultDecodeToken('not-a-jwt-at-all');
    assert.equal(result, null);
  });
});

test('defaultDecodeToken: returns null for JSON-wrapped garbage token', () => {
  assert.doesNotThrow(() => {
    const result = defaultDecodeToken(JSON.stringify({ refresh: 'garbage' }));
    assert.equal(result, null);
  });
});

// --- New tests for M1: clock tolerance ---

test('defaultVerifyToken: token expired 30s ago still passes with default 60s tolerance', () => {
  const payload = { exp: nowSec() - 30 };
  assert.equal(defaultVerifyToken(payload), true);
});

test('defaultVerifyToken: token expired 120s ago fails even with 60s tolerance', () => {
  const payload = { exp: nowSec() - 120 };
  assert.equal(defaultVerifyToken(payload), false);
});

test('defaultVerifyToken: token expired 30s ago fails with clockToleranceSec=0 (strict)', () => {
  const payload = { exp: nowSec() - 30 };
  assert.equal(defaultVerifyToken(payload, 0), false);
});
