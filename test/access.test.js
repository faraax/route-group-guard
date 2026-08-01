import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAccess } from '../src/auth/access.js';

const unauth = { isAuthenticated: false, role: undefined, permissions: [] };
const authNoRole = { isAuthenticated: true, role: undefined, permissions: [] };

test('public routes are always allowed, even when unauthenticated', () => {
  const result = checkAccess({ access: 'public', roles: [], permissions: [] }, unauth, 'private');
  assert.deepEqual(result, { allowed: true });
});

test('private route + unauthenticated is denied with reason "unauthenticated"', () => {
  const result = checkAccess({ access: 'private', roles: [], permissions: [] }, unauth, 'private');
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'unauthenticated');
});

test('private route with no roles/permissions required + authenticated is allowed', () => {
  const result = checkAccess({ access: 'private', roles: [], permissions: [] }, authNoRole, 'private');
  assert.deepEqual(result, { allowed: true });
});

test('route with no explicit access falls back to defaultAccess', () => {
  const route = { roles: [], permissions: [] }; // access is undefined
  assert.equal(checkAccess(route, unauth, 'public').allowed, true);
  assert.equal(checkAccess(route, unauth, 'private').allowed, false);
});

test('role check: "any" mode allows a user with one of several listed roles', () => {
  const route = { access: 'private', roles: ['ADMIN', 'MANAGER'], permissions: [] };
  const session = { isAuthenticated: true, role: 'MANAGER', permissions: [] };
  assert.equal(checkAccess(route, session, 'private').allowed, true);
});

test('role check: user missing the required role is denied with reason "role"', () => {
  const route = { access: 'private', roles: ['ADMIN'], permissions: [] };
  const session = { isAuthenticated: true, role: 'BILLING', permissions: [] };
  const result = checkAccess(route, session, 'private');
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'role');
});

test('role check: "all" mode requires every listed role (multi-role session as array)', () => {
  const route = { access: 'private', roles: ['ADMIN', 'AUDITOR'], roleMode: 'all', permissions: [] };
  const missingOne = { isAuthenticated: true, role: ['ADMIN'], permissions: [] };
  const hasBoth = { isAuthenticated: true, role: ['ADMIN', 'AUDITOR'], permissions: [] };
  assert.equal(checkAccess(route, missingOne, 'private').allowed, false);
  assert.equal(checkAccess(route, hasBoth, 'private').allowed, true);
});

test('permission check: "any" mode', () => {
  const route = { access: 'private', roles: [], permissions: ['manage_billing', 'view_reports'] };
  const session = { isAuthenticated: true, role: undefined, permissions: ['view_reports'] };
  assert.equal(checkAccess(route, session, 'private').allowed, true);
});

test('permission check: "all" mode requires every listed permission', () => {
  const route = {
    access: 'private',
    roles: [],
    permissions: ['manage_billing', 'view_reports'],
    permissionMode: 'all',
  };
  const partial = { isAuthenticated: true, role: undefined, permissions: ['view_reports'] };
  const full = { isAuthenticated: true, role: undefined, permissions: ['view_reports', 'manage_billing'] };
  const partialResult = checkAccess(route, partial, 'private');
  assert.equal(partialResult.allowed, false);
  assert.equal(partialResult.reason, 'permission');
  assert.equal(checkAccess(route, full, 'private').allowed, true);
});

test('roles and permissions are independent gates: both must pass when both are specified', () => {
  const route = { access: 'private', roles: ['ADMIN'], permissions: ['manage_billing'] };
  const roleOnly = { isAuthenticated: true, role: 'ADMIN', permissions: [] };
  const permOnly = { isAuthenticated: true, role: 'BILLING', permissions: ['manage_billing'] };
  const both = { isAuthenticated: true, role: 'ADMIN', permissions: ['manage_billing'] };

  assert.equal(checkAccess(route, roleOnly, 'private').reason, 'permission');
  assert.equal(checkAccess(route, permOnly, 'private').reason, 'role');
  assert.equal(checkAccess(route, both, 'private').allowed, true);
});
