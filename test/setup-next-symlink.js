// Test-only setup, imported by middleware.test.js. Never shipped (test/ is
// not in package.json "files", and node_modules is never published).
//
// `next`'s package.json has no "exports" map, so Node's ESM resolver
// requires the exact filename `next/server.js`. Real Next.js apps never hit
// this because their bundler (webpack/Turbopack) resolves `next/server`
// itself. This symlink makes plain `node --test` resolve it the same way,
// so the middleware test exercises the *real* NextRequest/NextResponse
// instead of a hand-rolled mock.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nextServerPath = path.join(__dirname, '..', 'node_modules', 'next', 'server');

if (!fs.existsSync(nextServerPath)) {
  try {
    fs.symlinkSync('server.js', nextServerPath);
  } catch (err) {
    console.warn(
      `[route-group-guard tests] could not create the next/server symlink (${err.message}). ` +
        'middleware.test.js will fail to import "next/server" — run: ln -s server.js node_modules/next/server'
    );
  }
}
