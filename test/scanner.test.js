import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanAppDir, lintRoutes } from '../src/manifest/scanner.js';

function makeFixture(structure) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rgg-scanner-'));
  for (const filePath of structure) {
    const full = path.join(root, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '// fixture page\nexport default function Page() { return null; }\n');
  }
  return root;
}

function findRoute(routes, routePath) {
  return routes.find((r) => r.path === routePath);
}

test('scanAppDir: builds routes from a realistic folder tree', () => {
  const appDir = makeFixture([
    '(public)/page.js',
    '(public)/login/page.js',
    '(public)/blog/page.js',
    '(public)/blog/[slug]/page.js',
    '(private)/(role:ADMIN)/admindashboard/page.js',
    '(private)/(role:ADMIN)/billing/(perm:manage_billing)/page.js',
    '(private)/(role:DOCTOR)/doctordashboard/page.js',
    '_components/Button.js', // private folder, must be ignored entirely
    'no-group-route/page.js', // no (public)/(private) anywhere on its path
  ]);

  const { routes } = scanAppDir(appDir);

  assert.deepEqual(findRoute(routes, '/'), { path: '/', access: 'public', roles: [], permissions: [] });
  assert.deepEqual(findRoute(routes, '/login'), {
    path: '/login',
    access: 'public',
    roles: [],
    permissions: [],
  });
  assert.deepEqual(findRoute(routes, '/blog/[slug]'), {
    path: '/blog/[slug]',
    access: 'public',
    roles: [],
    permissions: [],
  });
  assert.deepEqual(findRoute(routes, '/admindashboard'), {
    path: '/admindashboard',
    access: 'private',
    roles: ['ADMIN'],
    permissions: [],
  });
  assert.deepEqual(findRoute(routes, '/billing'), {
    path: '/billing',
    access: 'private',
    roles: ['ADMIN'],
    permissions: ['manage_billing'],
  });
  assert.deepEqual(findRoute(routes, '/doctordashboard'), {
    path: '/doctordashboard',
    access: 'private',
    roles: ['DOCTOR'],
    permissions: [],
  });

  // "_components" must never produce a route or leak into the URL space.
  assert.equal(routes.some((r) => r.path.includes('_components') || r.path.includes('Button')), false);

  // A page with no (public)/(private) anywhere above it has access: undefined
  // — the middleware applies `defaultAccess` for these, the scanner doesn't guess.
  const noGroup = findRoute(routes, '/no-group-route');
  assert.equal(noGroup.access, undefined);

  fs.rmSync(appDir, { recursive: true, force: true });
});

// Regression test: bare route groups like `(dashboard)` are a completely
// standard Next.js pattern for giving a section its own layout, with zero
// access-control meaning. Before the `role:` prefix was required, a group
// like this was silently misread as requiring a role literally named
// "dashboard" — which doesn't exist, quietly locking out every route
// beneath it. This is exactly the shape of an existing real project
// (Le Bosphorus HMS uses `app/(dashboard)/bookings/page.jsx`).
test('scanAppDir: a bare organizational route group (e.g. (dashboard)) has no access effect', () => {
  const appDir = makeFixture([
    '(dashboard)/bookings/page.js',
    '(dashboard)/(private)/(role:ADMIN)/settings/page.js',
  ]);

  const { routes, ignoredGroups } = scanAppDir(appDir);

  const bookings = findRoute(routes, '/bookings');
  assert.deepEqual(bookings, { path: '/bookings', access: undefined, roles: [], permissions: [] });

  // A role/permission group nested *inside* an organizational group still
  // works normally — only the organizational group itself is a no-op.
  const settings = findRoute(routes, '/settings');
  assert.deepEqual(settings, { path: '/settings', access: 'private', roles: ['ADMIN'], permissions: [] });

  assert.deepEqual(ignoredGroups, ['dashboard']);

  fs.rmSync(appDir, { recursive: true, force: true });
});

test('scanAppDir: ignores parallel route slots (@slot) and intercepting route markers', () => {
  const appDir = makeFixture([
    '(public)/feed/page.js',
    '(public)/feed/@modal/page.js', // parallel slot — must not become its own route
    '(public)/feed/(.)photo/page.js', // intercepting route — must not become its own route
  ]);

  const { routes } = scanAppDir(appDir);

  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, '/feed');

  fs.rmSync(appDir, { recursive: true, force: true });
});

test('lintRoutes: warns when a route is public AND inside a role/permission group', () => {
  const appDir = makeFixture(['(public)/(role:ADMIN)/oops/page.js']);
  const { routes } = scanAppDir(appDir);
  const warnings = lintRoutes(routes);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /oops/);
  assert.match(warnings[0], /public/i);

  fs.rmSync(appDir, { recursive: true, force: true });
});

test('lintRoutes: no warnings for a clean tree', () => {
  const appDir = makeFixture(['(public)/page.js', '(private)/(role:ADMIN)/admin/page.js']);
  const { routes } = scanAppDir(appDir);
  assert.deepEqual(lintRoutes(routes), []);
  fs.rmSync(appDir, { recursive: true, force: true });
});

test('scanAppDir: recognizes page.mdx files as route pages', () => {
  const appDir = makeFixture(['docs/page.mdx']);
  const { routes } = scanAppDir(appDir);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, '/docs');
  fs.rmSync(appDir, { recursive: true, force: true });
});

test('scanAppDir: skips circular symlinks without hanging or crashing', () => {
  const appDir = makeFixture(['(public)/home/page.js']);
  try {
    fs.symlinkSync(appDir, path.join(appDir, 'recursive_link'), 'dir');
  } catch {
    fs.rmSync(appDir, { recursive: true, force: true });
    return;
  }
  const { routes } = scanAppDir(appDir);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, '/home');
  fs.rmSync(appDir, { recursive: true, force: true });
});

