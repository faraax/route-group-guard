import { test } from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import { resolveSession } from '../src/auth/token.js';

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

test('resolveSession: no cookie present -> not authenticated', () => {
  const session = resolveSession(mockCookies({}), { cookieName: 'auth_token' });
  assert.deepEqual(session, { isAuthenticated: false, role: undefined, permissions: [], payload: null });
});

test('resolveSession: valid raw JWT string, unexpired', () => {
  const token = makeFakeJwt({
    role: 'ADMIN',
    permissions: ['manage_billing'],
    exp: dayjs().add(1, 'hour').unix(),
  });
  const session = resolveSession(mockCookies({ auth_token: token }), { cookieName: 'auth_token' });
  assert.equal(session.isAuthenticated, true);
  assert.equal(session.role, 'ADMIN');
  assert.deepEqual(session.permissions, ['manage_billing']);
});

test('resolveSession: JSON {access, refresh} cookie shape decodes the refresh token', () => {
  const refresh = makeFakeJwt({ role: 'DOCTOR', exp: dayjs().add(1, 'day').unix() });
  const access = makeFakeJwt({ role: 'DOCTOR', exp: dayjs().add(5, 'minute').unix() });
  const cookieValue = JSON.stringify({ access, refresh });
  const session = resolveSession(mockCookies({ auth_token: cookieValue }), { cookieName: 'auth_token' });
  assert.equal(session.isAuthenticated, true);
  assert.equal(session.role, 'DOCTOR');
});

test('resolveSession: expired token -> not authenticated', () => {
  const token = makeFakeJwt({ role: 'ADMIN', exp: dayjs().subtract(1, 'hour').unix() });
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
  const token = makeFakeJwt({ role: 'ADMIN', exp: dayjs().add(1, 'hour').unix() });
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
