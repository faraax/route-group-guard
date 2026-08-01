import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatcher } from '../src/manifest/matcher.js';

const baseRoutes = [
  { path: '/', access: 'public', roles: [], permissions: [] },
  { path: '/about', access: 'public', roles: [], permissions: [] },
  { path: '/blog', access: 'public', roles: [], permissions: [] },
  { path: '/blog/featured', access: 'public', roles: [], permissions: [] },
  { path: '/blog/[slug]', access: 'public', roles: [], permissions: [] },
  { path: '/docs/[...slug]', access: 'private', roles: ['ADMIN'], permissions: [] },
  { path: '/shop/[[...filters]]', access: 'public', roles: [], permissions: [] },
];

test('matches the root path exactly', () => {
  const { match } = createMatcher(baseRoutes);
  assert.equal(match('/').path, '/');
  assert.equal(match('/x'), null);
});

test('static routes match exactly and nothing else', () => {
  const { match } = createMatcher(baseRoutes);
  assert.equal(match('/about').path, '/about');
  assert.equal(match('/about/team'), null);
});

test('dynamic segment matches and captures a string param', () => {
  const { match } = createMatcher(baseRoutes);
  const result = match('/blog/hello-world');
  assert.equal(result.path, '/blog/[slug]');
  assert.equal(result.params.slug, 'hello-world');
});

test('a static sibling wins over a dynamic segment at the same depth', () => {
  const { match } = createMatcher(baseRoutes);
  const result = match('/blog/featured');
  assert.equal(result.path, '/blog/featured');
});

test('dynamic segment does not match extra path depth', () => {
  const { match } = createMatcher(baseRoutes);
  assert.equal(match('/blog/a/b'), null);
});

test('catch-all matches multiple segments as an array, requires at least one', () => {
  const { match } = createMatcher(baseRoutes);
  const result = match('/docs/a/b/c');
  assert.equal(result.path, '/docs/[...slug]');
  assert.deepEqual(result.params.slug, ['a', 'b', 'c']);
  assert.deepEqual(result.roles, ['ADMIN']);

  assert.equal(match('/docs'), null, 'catch-all requires at least one segment');
});

test('optional catch-all matches the bare parent path with an undefined param', () => {
  const { match } = createMatcher(baseRoutes);
  const bare = match('/shop');
  assert.equal(bare.path, '/shop/[[...filters]]');
  assert.equal(bare.params.filters, undefined);
});

test('optional catch-all also matches with segments, captured as an array', () => {
  const { match } = createMatcher(baseRoutes);
  const withSegments = match('/shop/red/xl');
  assert.equal(withSegments.path, '/shop/[[...filters]]');
  assert.deepEqual(withSegments.params.filters, ['red', 'xl']);
});

test('trailing slash is normalized before matching', () => {
  const { match } = createMatcher(baseRoutes);
  assert.equal(match('/about/').path, '/about');
});

test('unmatched paths return null', () => {
  const { match } = createMatcher(baseRoutes);
  assert.equal(match('/totally/unknown/path'), null);
});
