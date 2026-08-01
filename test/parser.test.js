import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGroupSegment, mergeMeta, emptyMeta } from '../src/manifest/parser.js';

test('parseGroupSegment: public/private keywords', () => {
  assert.deepEqual(parseGroupSegment('public'), { access: 'public' });
  assert.deepEqual(parseGroupSegment('private'), { access: 'private' });
});

test('parseGroupSegment: single role', () => {
  assert.deepEqual(parseGroupSegment('ADMIN'), { roles: ['ADMIN'] });
});

test('parseGroupSegment: multiple roles with +', () => {
  assert.deepEqual(parseGroupSegment('ADMIN+MANAGER'), { roles: ['ADMIN', 'MANAGER'] });
});

test('parseGroupSegment: single permission', () => {
  assert.deepEqual(parseGroupSegment('perm:manage_billing'), { permissions: ['manage_billing'] });
});

test('parseGroupSegment: multiple permissions with +', () => {
  assert.deepEqual(parseGroupSegment('perm:manage_billing+view_reports'), {
    permissions: ['manage_billing', 'view_reports'],
  });
});

test('parseGroupSegment: empty segment yields empty object', () => {
  assert.deepEqual(parseGroupSegment(''), {});
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
