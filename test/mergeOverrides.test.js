import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeOverrides } from '../src/config/mergeOverrides.js';

const manifest = [
  { path: '/', access: 'public', roles: [], permissions: [] },
  { path: '/admindashboard', access: 'private', roles: ['ADMIN'], permissions: [] },
];

test('no overrides returns the manifest routes unchanged', () => {
  const result = mergeOverrides(manifest, []);
  assert.deepEqual(result, manifest);
});

test('overrides default to undefined omitted fields', () => {
  const result = mergeOverrides(manifest, []);
  assert.deepEqual(result, manifest);
});

test('an override matching an existing path fully replaces that entry', () => {
  const result = mergeOverrides(manifest, [
    { path: '/admindashboard', access: 'private', roles: ['ADMIN', 'MANAGER'], permissions: [] },
  ]);
  const entry = result.find((r) => r.path === '/admindashboard');
  assert.deepEqual(entry.roles, ['ADMIN', 'MANAGER']);
  assert.equal(result.length, manifest.length, 'replacing must not add a duplicate entry');
});

test('an override with a new path is appended (this is how Pages Router config works)', () => {
  const result = mergeOverrides(manifest, [{ path: '/legacy-billing', access: 'private', roles: ['BILLING'] }]);
  assert.equal(result.length, manifest.length + 1);
  const entry = result.find((r) => r.path === '/legacy-billing');
  assert.deepEqual(entry.roles, ['BILLING']);
  assert.deepEqual(entry.permissions, [], 'unspecified fields default sensibly');
});

test('an empty manifest plus overrides works standalone (Pages Router mode)', () => {
  const result = mergeOverrides([], [
    { path: '/', access: 'public' },
    { path: '/admin', access: 'private', roles: ['ADMIN'] },
  ]);
  assert.equal(result.length, 2);
});

// Regression test: `import manifest from './route-guard.manifest.json'` hands
// you {generatedAt, routeCount, routes: [...]}, not a bare array — this used
// to throw ("manifest.map is not a function") the moment a real generated
// file was wired into a real middleware.js.
test('accepts the raw generated manifest file shape ({routes: [...]}), not just a bare array', () => {
  const generatedFile = { generatedAt: '2026-01-01T00:00:00.000Z', routeCount: 2, routes: manifest };
  const result = mergeOverrides(generatedFile, []);
  assert.deepEqual(result, manifest);
});

test('accepts an object-shaped overrides argument the same way', () => {
  const result = mergeOverrides(manifest, { routes: [{ path: '/legacy', access: 'public' }] });
  assert.ok(result.find((r) => r.path === '/legacy'));
});

test('tolerates missing/undefined manifest and overrides instead of throwing', () => {
  assert.deepEqual(mergeOverrides(undefined, undefined), []);
  assert.deepEqual(mergeOverrides(null, null), []);
});
