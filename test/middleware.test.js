// This test exercises the real `next/server` module (NextRequest/NextResponse),
// not a mock, so it genuinely verifies the middleware wiring. It needs a
// local, test-only symlink (node_modules/next/server -> server.js) because
// `next`'s package.json has no "exports" map: real Next.js apps resolve
// `next/server` fine because their bundler (webpack/Turbopack) resolves it,
// but plain `node --test` uses Node's stricter ESM resolver, which requires
// an exact filename. The symlink is created by test/setup-next-symlink.js.
//
// That symlink has to exist *before* anything resolves `next/server` — and
// static `import` specifiers are all resolved during this file's
// construction phase, before any of its top-level code (including the
// setup-next-symlink.js side effect) runs. So `next/server` and
// `../src/middleware.js` (which itself imports `next/server`) are loaded
// with dynamic `import()` below instead: dynamic imports resolve lazily, at
// the point they're awaited, which is after the symlink has been created.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './setup-next-symlink.js';

const { NextRequest } = await import('next/server');
const { createRouteGuardMiddleware } = await import('../src/middleware.js');

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function makeFakeJwt(payload) {
  return `${b64url({ alg: 'none' })}.${b64url(payload)}.sig`;
}
function nowSec() {
  return Math.floor(Date.now() / 1000);
}

const manifest = [
  { path: '/', access: 'public', roles: [], permissions: [] },
  { path: '/login', access: 'public', roles: [], permissions: [] },
  { path: '/dashboard', access: 'private', roles: [], permissions: [] },
  { path: '/admindashboard', access: 'private', roles: ['ADMIN'], permissions: [] },
];

function requestFor(pathname, cookieValue) {
  const headers = cookieValue ? { cookie: `auth_token=${cookieValue}` } : {};
  return new NextRequest(`https://example.com${pathname}`, { headers });
}

function isRedirectTo(res, path) {
  const location = res.headers.get('location');
  return location !== null && new URL(location).pathname === path;
}

function isNext(res) {
  return res.headers.get('x-middleware-next') === '1';
}

test('public route passes through with no cookie', () => {
  const middleware = createRouteGuardMiddleware({ manifest });
  const res = middleware(requestFor('/'));
  assert.equal(isNext(res), true);
});

test('private route + no cookie redirects to /login', () => {
  const middleware = createRouteGuardMiddleware({ manifest });
  const res = middleware(requestFor('/dashboard'));
  assert.equal(isRedirectTo(res, '/login'), true);
});

test('private route + valid cookie passes through', () => {
  const middleware = createRouteGuardMiddleware({ manifest });
  const token = makeFakeJwt({ role: 'ADMIN', exp: nowSec() + 3600 });
  const res = middleware(requestFor('/dashboard', token));
  assert.equal(isNext(res), true);
});

test('role-protected route + wrong role redirects to the default redirect', () => {
  const middleware = createRouteGuardMiddleware({ manifest, redirects: { unauthorized: '/403' } });
  const token = makeFakeJwt({ role: 'BILLING', exp: nowSec() + 3600 });
  const res = middleware(requestFor('/admindashboard', token));
  assert.equal(isRedirectTo(res, '/403'), true);
});

test('role-protected route + wrong role uses getRoleHome when provided', () => {
  const roleHomes = { BILLING: '/billerdashboard', ADMIN: '/admindashboard' };
  const middleware = createRouteGuardMiddleware({
    manifest,
    getRoleHome: (role) => roleHomes[role],
  });
  const token = makeFakeJwt({ role: 'BILLING', exp: nowSec() + 3600 });
  const res = middleware(requestFor('/admindashboard', token));
  assert.equal(isRedirectTo(res, '/billerdashboard'), true);
});

test('redirectAuthenticatedFrom bounces a logged-in user away from /login', () => {
  const middleware = createRouteGuardMiddleware({
    manifest,
    redirectAuthenticatedFrom: ['/login'],
    redirects: { home: '/dashboard' },
  });
  const token = makeFakeJwt({ role: 'ADMIN', exp: nowSec() + 3600 });
  const res = middleware(requestFor('/login', token));
  assert.equal(isRedirectTo(res, '/dashboard'), true);
});

test('expired token is treated as unauthenticated', () => {
  const middleware = createRouteGuardMiddleware({ manifest });
  const token = makeFakeJwt({ role: 'ADMIN', exp: nowSec() - 3600 });
  const res = middleware(requestFor('/dashboard', token));
  assert.equal(isRedirectTo(res, '/login'), true);
});

test('overrides merge on top of the manifest at middleware build time', () => {
  const middleware = createRouteGuardMiddleware({
    manifest,
    overrides: [{ path: '/dashboard', access: 'private', roles: ['ADMIN'] }],
  });
  const token = makeFakeJwt({ role: 'BILLING', exp: nowSec() + 3600 });
  const res = middleware(requestFor('/dashboard', token));
  assert.equal(isRedirectTo(res, '/login'), false);
  assert.equal(isNext(res), false, 'BILLING should now be rejected from the now-ADMIN-only /dashboard');
});

// Regression test: this is what `import manifest from './route-guard.manifest.json'`
// actually hands you — {generatedAt, routeCount, routes: [...]} — not a bare
// array. Building the middleware with this exact shape used to throw at
// module-eval time in a real Next.js app before any request was even handled.
test('builds correctly from the raw generated-file shape, same as a real static JSON import', () => {
  const generatedFile = { generatedAt: '2026-01-01T00:00:00.000Z', routeCount: manifest.length, routes: manifest };
  const middleware = createRouteGuardMiddleware({ manifest: generatedFile });
  assert.equal(isNext(middleware(requestFor('/'))), true);
  assert.equal(isRedirectTo(middleware(requestFor('/dashboard')), '/login'), true);
});

test('throws TypeError on invalid options inputs', () => {
  assert.throws(() => createRouteGuardMiddleware(null), /options must be a plain object/);
  assert.throws(() => createRouteGuardMiddleware('invalid'), /options must be a plain object/);
  assert.throws(() => createRouteGuardMiddleware({ manifest: 42 }), /manifest must be an array or an object/);
  assert.throws(() => createRouteGuardMiddleware({ overrides: 'bad' }), /overrides must be an array or an object/);
  assert.throws(() => createRouteGuardMiddleware({ cookieName: 123 }), /cookieName must be a non-empty string/);
  assert.throws(() => createRouteGuardMiddleware({ defaultAccess: 'invalid' }), /defaultAccess must be "public" or "private"/);
  assert.throws(() => createRouteGuardMiddleware({ redirects: 'bad' }), /redirects must be a plain object/);
  assert.throws(() => createRouteGuardMiddleware({ redirectAuthenticatedFrom: 'bad' }), /redirectAuthenticatedFrom must be an array/);
  assert.throws(() => createRouteGuardMiddleware({ getToken: 'not-a-func' }), /getToken must be a function/);
});

test('redirect loop guard: unauthenticated request to login path passes through', () => {
  const middleware = createRouteGuardMiddleware({
    manifest: [{ path: '/login', access: 'private', roles: [], permissions: [] }],
    redirects: { login: '/login' },
  });
  const res = middleware(requestFor('/login'));
  assert.equal(isNext(res), true);
});

test('redirect loop guard: unauthorized request matching unauthorized redirect passes through', () => {
  const middleware = createRouteGuardMiddleware({
    manifest: [{ path: '/forbidden', access: 'private', roles: ['ADMIN'], permissions: [] }],
    redirects: { unauthorized: '/forbidden' },
  });
  const token = makeFakeJwt({ role: 'USER', exp: nowSec() + 3600 });
  const res = middleware(requestFor('/forbidden', token));
  assert.equal(isNext(res), true);
});

