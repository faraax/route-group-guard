import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGroupSegment, mergeMeta, emptyMeta } from '../src/manifest/parser.js';

test('parseGroupSegment: public/private keywords', () => {
  assert.deepEqual(parseGroupSegment('public'), { access: 'public' });
  assert.deepEqual(parseGroupSegment('private'), { access: 'private' });
});

test('parseGroupSegment: single role via role: prefix', () => {
  assert.deepEqual(parseGroupSegment('role:ADMIN'), { roles: ['ADMIN'] });
});

test('parseGroupSegment: multiple roles with +', () => {
  assert.deepEqual(parseGroupSegment('role:ADMIN+MANAGER'), { roles: ['ADMIN', 'MANAGER'] });
});

test('parseGroupSegment: single permission', () => {
  assert.deepEqual(parseGroupSegment('perm:manage_billing'), { permissions: ['manage_billing'] });
});

test('parseGroupSegment: multiple permissions with +', () => {
  assert.deepEqual(parseGroupSegment('perm:manage_billing+view_reports'), {
    permissions: ['manage_billing', 'view_reports'],
  });
});

test('parseGroupSegment: dotted permission keys (module.action style) pass through untouched', () => {
  assert.deepEqual(parseGroupSegment('perm:bookings.read'), { permissions: ['bookings.read'] });
});

test('parseGroupSegment: empty segment yields empty object', () => {
  assert.deepEqual(parseGroupSegment(''), {});
});

// Regression test: a bare group name with no role:/perm: prefix must be a
// pure no-op — this is what makes it safe to add the package to a project
// that already uses route groups for layout organization only, like
// `(dashboard)` or `(marketing)`.
test('parseGroupSegment: a bare non-keyword group name is ignored, not treated as a role', () => {
  assert.deepEqual(parseGroupSegment('dashboard'), {});
  assert.deepEqual(parseGroupSegment('ADMIN'), {}, 'even an uppercase bare name is not a role without role:');
});

test('mergeMeta: access overrides, deepest wins', () => {
  let acc = emptyMeta();
  acc = mergeMeta(acc, { access: 'private' });
  acc = mergeMeta(acc, { access: 'public' });
  assert.equal(acc.access, 'public');
});

test('mergeMeta: roles and permissions accumulate and de-dupe', () => {
  let acc = emptyMeta();
  acc = mergeMeta(acc, { roles: ['ADMIN'] });
  acc = mergeMeta(acc, { permissions: ['manage_billing'] });
  acc = mergeMeta(acc, { roles: ['ADMIN', 'MANAGER'] }); // ADMIN repeated
  assert.deepEqual(acc.roles, ['ADMIN', 'MANAGER']);
  assert.deepEqual(acc.permissions, ['manage_billing']);
});

test('mergeMeta: does not mutate the accumulator passed in', () => {
  const acc = mergeMeta(emptyMeta(), { roles: ['ADMIN'] });
  const frozenRoles = [...acc.roles];
  mergeMeta(acc, { roles: ['MANAGER'] });
  assert.deepEqual(acc.roles, frozenRoles, 'original accumulator must stay untouched');
});
