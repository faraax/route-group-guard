import fs from 'node:fs';
import path from 'node:path';
import {
  emptyMeta,
  isRouteGroupSegment,
  mergeMeta,
  parseGroupSegment,
  stripGroupParens,
} from './parser.js';

const PAGE_FILENAMES = ['page.js', 'page.jsx', 'page.ts', 'page.tsx', 'page.mdx'];

/**
 * Folders Next.js itself never turns into routes, or that this package
 * deliberately does not guard on their own (see README > "Known limitations"):
 *   - `_folder`      private folder (Next.js convention, opts out of routing)
 *   - `@folder`      parallel route slot (renders into the *parent* URL, not its own)
 *   - `(.)x`, `(..)x`, `(...)x`, `(..)(..)x`   intercepting route markers
 *     (the intercepted URL is guarded normally via its own canonical route)
 */
function isIgnoredSegment(name) {
  if (name.startsWith('_')) return true;
  if (name.startsWith('@')) return true;
  if (/^\(\.{1,3}\)/.test(name)) return true; // (.)x  (..)x  (...)x
  if (/^\(\.\.\)\(\.\.\)/.test(name)) return true; // (..)(..)x
  return false;
}

/**
 * Recursively scans a Next.js `app/` directory and returns the raw list of
 * routes with the access metadata derived purely from folder names.
 *
 * This never runs in the Edge runtime — it's a Node.js build-time step
 * (invoked by the CLI, or optionally from `instrumentation.js`). The output
 * is meant to be written to a JSON file and *statically imported* wherever
 * it's needed, which is what lets the generated manifest reach Edge
 * middleware despite middleware having no `fs` access itself.
 *
 * @param {string} appDir - absolute path to the `app/` directory.
 * @returns {{
 *   routes: Array<{path: string, access?: string, roles: string[], permissions: string[]}>,
 *   ignoredGroups: string[]
 * }} `ignoredGroups` lists the distinct bare route-group names encountered
 *   that weren't `public`/`private`/`role:...`/`perm:...` — ordinary
 *   organizational groups (like `(dashboard)`) that were correctly left
 *   alone. Surfaced so you can eyeball that nothing unexpected got swept up.
 */
export function scanAppDir(appDir) {
  const routes = [];
  const ignoredGroups = new Set();

  function walk(dir, urlSegments, meta, seen = new Set()) {
    let realDir;
    try {
      realDir = fs.realpathSync(dir);
    } catch {
      realDir = dir;
    }
    if (seen.has(realDir)) {
      return;
    }
    const nextSeen = new Set(seen);
    nextSeen.add(realDir);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      throw new Error(`route-group-guard: could not read directory "${dir}": ${err.message}`);
    }

    const hasPage = entries.some((e) => e.isFile() && PAGE_FILENAMES.includes(e.name));
    if (hasPage) {
      routes.push({
        path: urlSegments.length === 0 ? '/' : '/' + urlSegments.join('/'),
        access: meta.access,
        roles: [...meta.roles],
        permissions: [...meta.permissions],
      });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;

      if (isIgnoredSegment(name)) continue;

      if (isRouteGroupSegment(name)) {
        const rawName = stripGroupParens(name);
        const segmentMeta = parseGroupSegment(rawName);
        if (Object.keys(segmentMeta).length === 0) {
          ignoredGroups.add(rawName);
        }
        walk(path.join(dir, name), urlSegments, mergeMeta(meta, segmentMeta), nextSeen);
        continue;
      }

      walk(path.join(dir, name), [...urlSegments, name], meta, nextSeen);
    }
  }

  if (!fs.existsSync(appDir)) {
    throw new Error(`route-group-guard: app directory not found at "${appDir}"`);
  }

  walk(appDir, [], emptyMeta());

  // Stable order makes generated JSON diff-friendly in git.
  routes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return { routes, ignoredGroups: [...ignoredGroups].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) };
}

/**
 * Emits a build-time warning (not an error — routing still works) for
 * conventions that are almost certainly a mistake, e.g. a route marked
 * `(public)` that also sits under a role/permission group.
 * @param {Array<{path: string, access?: string, roles: string[], permissions: string[]}>} routes
 * @returns {string[]} human-readable warning messages
 */
export function lintRoutes(routes) {
  const warnings = [];
  for (const route of routes) {
    if (route.access === 'public' && (route.roles.length > 0 || route.permissions.length > 0)) {
      warnings.push(
        `"${route.path}" is inside a (public) group but also inside a role/permission group (roles: [${route.roles.join(', ')}], permissions: [${route.permissions.join(', ')}]). Public routes ignore roles and permissions — this is likely unintentional.`
      );
    }
  }
  return warnings;
}
