import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../bin/cli.js');

test('CLI prints help when invoked without command or with --help', () => {
  const res = spawnSync('node', [cliPath], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Usage:/);
  assert.match(res.stdout, /route-group-guard generate/);

  const resHelp = spawnSync('node', [cliPath, '--help'], { encoding: 'utf8' });
  assert.equal(resHelp.status, 0);
  assert.match(resHelp.stdout, /Usage:/);
});

test('CLI prints version with --version', () => {
  const res = spawnSync('node', [cliPath, '--version'], { encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.match(res.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('CLI errors when --app-dir is missing a value', () => {
  const res = spawnSync('node', [cliPath, 'generate', '--app-dir'], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Missing value for --app-dir option/);
});

test('CLI errors when --out is missing a value', () => {
  const res = spawnSync('node', [cliPath, 'generate', '--out'], { encoding: 'utf8' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Missing value for --out option/);
});

test('CLI errors when --app-dir points to a nonexistent directory', () => {
  const res = spawnSync('node', [cliPath, 'generate', '--app-dir', 'nonexistent-directory-xyz'], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Directory does not exist/);
});
