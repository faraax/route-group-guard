#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateManifest } from '../src/manifest/generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPkgVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

function detectAppDir(cwd) {
  const candidates = ['app', 'src/app'];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(cwd, candidate))) {
      return path.join(cwd, candidate);
    }
  }
  return null;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--app-dir') {
      const val = argv[++i];
      if (!val || val.startsWith('-')) {
        console.error('[route-group-guard] Missing value for --app-dir option');
        process.exitCode = 1;
        return null;
      }
      args.appDir = val;
    } else if (arg === '--out') {
      const val = argv[++i];
      if (!val || val.startsWith('-')) {
        console.error('[route-group-guard] Missing value for --out option');
        process.exitCode = 1;
        return null;
      }
      args.out = val;
    } else if (arg === '--watch') {
      args.watch = true;
    } else if (arg === '--silent') {
      args.silent = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--version' || arg === '-v') {
      args.version = true;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function printHelp() {
  console.log(`route-group-guard v${readPkgVersion()}

Usage:
  route-group-guard generate [options]   Scan your app/ (or src/app/) directory
                                          and write the route manifest JSON.

Options:
  --app-dir <dir>   Path to your Next.js app directory (default: auto-detect
                     "app" then "src/app")
  --out <file>      Output path for the manifest (default: route-guard.manifest.json)
  --watch           Re-generate on every filesystem change under app-dir
  --silent          Suppress lint warnings
  -h, --help        Show this help
  -v, --version     Show the installed version

Examples:
  route-group-guard generate
  route-group-guard generate --app-dir src/app --out src/route-guard.manifest.json
  route-group-guard generate --watch
`);
}

function run(args, cwd) {
  const appDir = args.appDir ? path.resolve(cwd, args.appDir) : detectAppDir(cwd);

  if (!appDir || !fs.existsSync(appDir)) {
    console.error(
      args.appDir
        ? `[route-group-guard] Directory does not exist: "${appDir}".`
        : '[route-group-guard] Could not find "app" or "src/app". Pass --app-dir <path> explicitly.'
    );
    process.exitCode = 1;
    return;
  }

  const outFile = path.resolve(cwd, args.out || 'route-guard.manifest.json');

  try {
    const { routes, warnings } = generateManifest({ appDir, outFile, silent: args.silent });
    const relOut = path.relative(cwd, outFile);
    console.log(`[route-group-guard] wrote ${routes.length} route(s) to ${relOut}`);
    if (warnings.length > 0 && !args.silent) {
      console.log(`[route-group-guard] ${warnings.length} warning(s) — see above`);
    }
  } catch (err) {
    console.error(`[route-group-guard] ${err.message.replace(/^route-group-guard:\s*/, '')}`);
    process.exitCode = 1;
  }
}

function main() {
  const cwd = process.cwd();
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (!args) {
    return;
  }

  if (args.help || (args._[0] !== 'generate' && args._[0] !== 'sync' && args._[0] !== 'build' && !args.version)) {
    printHelp();
    return;
  }

  if (args.version) {
    console.log(readPkgVersion());
    return;
  }

  run(args, cwd);

  if (args.watch) {
    const appDir = args.appDir ? path.resolve(cwd, args.appDir) : detectAppDir(cwd);
    if (!appDir || !fs.existsSync(appDir)) {
      return;
    }
    console.log(`[route-group-guard] watching ${path.relative(cwd, appDir)} for changes...`);
    let pending = null;
    let watcher = null;

    const cleanup = () => {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
      process.exit(0);
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);

    try {
      watcher = fs.watch(appDir, { recursive: true }, () => {
        clearTimeout(pending);
        pending = setTimeout(() => run(args, cwd), 150);
      });
    } catch (err) {
      console.error(
        `[route-group-guard] recursive watch is not supported on this platform/Node version (${err.message}). Re-run "route-group-guard generate" manually after adding routes, or upgrade Node.`
      );
    }
  }
}

main();
