import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineConfig } from '../src/config/defineConfig.js';

test('defineConfig returns the input array unmodified for valid config', () => {
  const overrides = [
    { path: '/billing', access: 'private', roles: ['BILLING'], permissions: ['manage_billing'], roleMode: 'any', permissionMode: 'all' },
  ];
  const result = defineConfig(overrides);
  assert.equal(result, overrides);
});

test('defineConfig throws TypeError for non-array inputs', () => {
  assert.throws(() => defineConfig(null), /defineConfig expects an array/);
  assert.throws(() => defineConfig({}), /defineConfig expects an array/);
  assert.throws(() => defineConfig('not an array'), /defineConfig expects an array/);
});

test('defineConfig throws TypeError for invalid items', () => {
  assert.throws(() => defineConfig([null]), /item at index 0 must be a route override object/);
  assert.throws(() => defineConfig(['string']), /item at index 0 must be a route override object/);
  assert.throws(() => defineConfig([{}]), /item at index 0 must have a non-empty string "path"/);
  assert.throws(() => defineConfig([{ path: '' }]), /item at index 0 must have a non-empty string "path"/);
});

test('defineConfig warns on unknown properties but does not throw', () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (msg) => warnings.push(msg);

  try {
    const config = defineConfig([{ path: '/dashboard', typoKey: true }]);
    assert.equal(config.length, 1);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /unknown property "typoKey"/);
  } finally {
    console.warn = originalWarn;
  }
});
