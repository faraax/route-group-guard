import fs from 'node:fs';
import path from 'node:path';
import { scanAppDir, lintRoutes } from './scanner.js';

/**
 * Scans `appDir`, lints the result, and writes the manifest JSON to
 * `outFile`. Shared by `bin/cli.js` and the optional `instrumentation.js`
 * auto-sync helper so both stay in sync.
 *
 * @param {{ appDir: string, outFile: string, silent?: boolean }} options
 * @returns {{ routes: object[], warnings: string[], ignoredGroups: string[], outFile: string }}
 */
export function generateManifest({ appDir, outFile, silent = false }) {
  const { routes, ignoredGroups } = scanAppDir(appDir);
  const warnings = lintRoutes(routes);

  if (!silent) {
    for (const warning of warnings) {
      // eslint-disable-next-line no-console
      console.warn(`[route-group-guard] warning: ${warning}`);
    }
    if (ignoredGroups.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[route-group-guard] ${ignoredGroups.length} organizational route group(s) left alone (no access effect): ${ignoredGroups.map((g) => `(${g})`).join(', ')}`
      );
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    routeCount: routes.length,
    routes,
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2) + '\n', 'utf8');

  return { routes, warnings, ignoredGroups, outFile };
}
