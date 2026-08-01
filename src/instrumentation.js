import path from 'node:path';
import fs from 'node:fs';
import { generateManifest } from './manifest/generate.js';

/**
 * Optional convenience for auto-generating the manifest when your Next.js
 * server boots, as an alternative (or supplement) to a `predev`/`prebuild`
 * npm script. Call it from your project's `instrumentation.js`:
 *
 * ```js
 * // instrumentation.js
 * export async function register() {
 *   if (process.env.NEXT_RUNTIME === 'nodejs') {
 *     const { ensureManifest } = await import('route-group-guard/instrumentation');
 *     ensureManifest();
 *   }
 * }
 * ```
 *
 * The `NEXT_RUNTIME` check matters: `register()` also fires once under the
 * Edge runtime for edge-specific setup, and this function needs `fs`.
 *
 * This runs once per server process start, not per request — during
 * `next dev`, adding a brand-new route folder still needs a restart (or run
 * `route-group-guard generate --watch` in a second terminal) to be picked up.
 *
 * @param {{ appDir?: string, outFile?: string, silent?: boolean }} [options]
 */
export function ensureManifest(options = {}) {
  const cwd = process.cwd();
  const appDir =
    options.appDir || (fs.existsSync(path.join(cwd, 'app')) ? path.join(cwd, 'app') : path.join(cwd, 'src', 'app'));
  const outFile = options.outFile || path.join(cwd, 'route-guard.manifest.json');

  return generateManifest({ appDir, outFile, silent: options.silent ?? true });
}
