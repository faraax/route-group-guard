# route-group-guard

Automatic Next.js route protection driven by the Route Groups you're
already using to organize your `app/` directory. Wrap a folder in
`(public)` or `(private)`, nest a role like `(role:ADMIN)` inside, and
the routing rules are generated for you — no hand-maintained
`roleRoutes` object, no manually-written redirect logic in `proxy.js`.

```
app/
├── (public)/
│   ├── page.js              →  /            (no auth required)
│   └── login/page.js        →  /login
└── (private)/
    └── (role:ADMIN)/
        └── admindashboard/page.js  →  /admindashboard  (needs a valid
                                                           session + role ADMIN)
```

```js
// proxy.js  (Next.js <16: name this file middleware.js instead — same
// content, same export, just the file-convention name changed in Next 16.
// See "A note on proxy.js vs middleware.js" below.)
import { createRouteGuardMiddleware } from 'route-group-guard';
import manifest from './route-guard.manifest.json';

export default createRouteGuardMiddleware({ manifest });

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|public|images).*)'],
};
```

```json
// package.json
{ "scripts": { "predev": "route-group-guard generate", "prebuild": "route-group-guard generate" } }
```

That's the whole integration. Run `npx route-group-guard generate` once
(or let `predev`/`prebuild` do it for you) and every route in `app/` is
guarded according to which Route Group folders it sits inside.

## A note on proxy.js vs middleware.js

Next.js 16 deprecated the `middleware.js` file convention and renamed it
to `proxy.js` — same feature, same behavior, just a different filename
(and, per Next's own docs, a nudge toward using it only for lightweight
routing decisions rather than heavier logic). It's a pure rename:
`createRouteGuardMiddleware` returns a plain function, and Next.js
doesn't care what you call the file that default-exports it.

- **Next.js 16+:** name the file `proxy.js`.
- **Next.js 13.4–15.x:** name it `middleware.js` (`proxy.js` isn't
  recognized yet).
- **Next.js 16, not yet migrated:** `middleware.js` still works today —
  Next.js logs a deprecation warning but still runs it. Don't leave it
  there indefinitely; there are reports of it being silently skipped
  after certain upgrades, which would mean every route it guards quietly
  becomes public. Rename it to `proxy.js` (or run
  `npx @next/codemod@latest middleware-to-proxy .`) rather than relying
  on the deprecated path.

Everything else in this README — the manifest, `overrides`, all the
options below — is identical either way.

## Why a generated manifest, not a webpack plugin

Next.js Edge Middleware doesn't have the Node.js `fs` module, so it can't
read your `app/` folder structure at request time — there's no way for
`proxy.js`/`middleware.js` to look at disk and ask "is this route inside
`(private)`?" while it's running.

This package solves that with a **build-time CLI step**: it walks `app/`
once, resolves the Route Group naming convention into a plain list of
routes with their access rules, and writes it to a JSON file. Your
`proxy.js`/`middleware.js` then does a normal, static `import manifest from
'./route-guard.manifest.json'`. Because it's a static import, Next.js's
bundler (webpack or Turbopack — this works with both) inlines the data
directly into the compiled middleware at build time. Nothing gets read
from disk while a request is in flight; the "file system access" already
happened before the Edge runtime ever starts.

A webpack-plugin-based approach was considered and rejected: Turbopack is
increasingly Next.js's default bundler and doesn't support classic
webpack plugins, so tying core functionality to webpack hooks would break
for a growing share of users. A plain CLI step works regardless of which
bundler you're on, is trivial to debug (open the JSON, read it), and is
the same well-understood pattern tools like Prisma or GraphQL Codegen use
for their generated artifacts.

If you'd rather not add a `predev`/`prebuild` script, see
[Auto-sync via instrumentation.js](#auto-sync-via-instrumentationjs) below.

## Installation

```bash
npm install route-group-guard
```

Requires Next.js ≥ 13.4 (App Router with Route Groups) and Node ≥ 18.17.
`dayjs` and `jwt-decode` are installed as direct dependencies — you don't
need to add them yourself.

## The naming convention

| Folder | Meaning |
| --- | --- |
| `(public)` | No authentication required |
| `(private)` | Requires a valid, unexpired session |
| `(role:ADMIN)` | Requires role `ADMIN` (implies private) |
| `(role:ADMIN+MANAGER)` | Requires role `ADMIN` **or** `MANAGER` |
| `(perm:manage_billing)` | Requires permission `manage_billing` |
| `(perm:manage_billing+view_reports)` | Requires **either** permission |

Names are case-sensitive on purpose, so a typo becomes a new (broken)
role instead of silently matching an existing one. Anything else — any
folder name that isn't `public`, `private`, or `role:...`/`perm:...` —
is left completely alone.

### Organizational route groups are safe to keep

Route Groups are a general Next.js feature, not something this package
invented, and plenty of real projects already use bare groups purely to
give a section its own layout — `(dashboard)`, `(marketing)`,
`(auth)` — with no access-control meaning at all. Those are untouched:
only `public`, `private`, `role:...`, and `perm:...` are recognized
keywords, so `(dashboard)` has zero effect on guarding.

This is a deliberate design choice, not an afterthought: an earlier
version of this package treated *any* non-reserved bare folder name as
a role, which meant a group like `(dashboard)` would have been silently
read as requiring a role literally named `"dashboard"` — locking
everyone out of every route beneath it, with no error and no warning.
Requiring the explicit `role:` prefix (symmetric with `perm:`) removes
that ambiguity entirely.

For visibility, `route-group-guard generate` prints every organizational
group it left alone:

```
[route-group-guard] 1 organizational route group(s) left alone (no access effect): (dashboard)
```

so you can eyeball that nothing unexpected got swept up. A role/permission
group nested *inside* an organizational one works normally —
`(dashboard)/(private)/(role:ADMIN)/settings/page.js` still guards
`/settings` — only the plain `(dashboard)` layer itself is a no-op.

### How nesting combines

Walk from `app/` down to a `page.js` and every Route Group segment along
the way contributes:

- **`access`** (`public`/`private`) is a simple override — the deepest
  one wins.
- **`roles`** and **`permissions`** accumulate as you nest deeper (with
  duplicates removed).

At request time: if the route has any roles listed, the user needs
**at least one** of them (or *all*, see [overrides](#fine-grained-overrides--pages-router)
for that escape hatch); if it has any permissions listed, same rule.
Roles and permissions are independent gates — if both are present on a
route, the user must satisfy both:

```
(private)/(role:ADMIN)/billing/(perm:manage_billing)/page.js
  → /billing needs role ADMIN *and* permission manage_billing
```

A route marked `(public)` ignores roles/permissions entirely; the CLI
prints a warning if it finds a route that's both `(public)` and inside a
role/permission group, since that combination is almost always a mistake.

### Routes with no group at all

A `page.js` that isn't inside any `(public)`/`(private)` folder falls
back to `defaultAccess` (an option on `createRouteGuardMiddleware`,
default `'private'` — secure by default). We'd rather you get an
unexpected redirect during development than an unexpected public page in
production.

## CLI reference

```bash
route-group-guard generate [options]
```

| Flag | Default | Description |
| --- | --- | --- |
| `--app-dir <dir>` | auto-detects `app`, then `src/app` | Where to scan |
| `--out <file>` | `route-guard.manifest.json` | Where to write the manifest |
| `--watch` | off | Re-generate on every change under `--app-dir` |
| `--silent` | off | Suppress lint warnings |

Wire it into `predev`/`prebuild` so it's always fresh:

```json
{
  "scripts": {
    "predev": "route-group-guard generate",
    "prebuild": "route-group-guard generate"
  }
}
```

Commit `route-guard.manifest.json` or `.gitignore` it and always
regenerate on install/build — either works, since it's fully derived
from `app/`.

## `createRouteGuardMiddleware(options)`

```js
import { createRouteGuardMiddleware } from 'route-group-guard';
import manifest from './route-guard.manifest.json';

export default createRouteGuardMiddleware({
  manifest,
  cookieName: 'auth_token',
  defaultAccess: 'private',
  redirects: { login: '/login', home: '/', unauthorized: '/403' },
  redirectAuthenticatedFrom: ['/login'],
  getRoleHome: (role) => ({ ADMIN: '/admindashboard', DOCTOR: '/doctordashboard' }[role]),
});
```

| Option | Default | Description |
| --- | --- | --- |
| `manifest` | `[]` | The generated manifest (statically imported). Leave as `[]` for a pure Pages Router / all-overrides setup. |
| `overrides` | — | Hand-written rules merged on top of `manifest`, see below. |
| `cookieName` | `'auth_token'` | Cookie read for the session token. |
| `defaultAccess` | `'private'` | Applied to routes with no `(public)`/`(private)` ancestor and no override. |
| `redirects.login` | `'/login'` | Where unauthenticated visitors go. |
| `redirects.home` | `'/'` | Fallback destination for authenticated-but-not-allowed, and for `redirectAuthenticatedFrom`. |
| `redirects.unauthorized` | — | Preferred over `redirects.home` for role/permission failures, if set. |
| `redirectAuthenticatedFrom` | `[]` | Exact paths (e.g. your login page) to bounce *authenticated* users away from. |
| `getRoleHome(role, session)` | — | Return a path for "send this role home". Wins over `redirects.unauthorized` when it returns a value — mirrors the common "wrong role → send them to *their* dashboard" pattern. |
| `getToken`, `decodeToken`, `verifyToken`, `getRole`, `getPermissions` | see [Auth pipeline](#auth-pipeline-jwt-decode--dayjs-and-how-to-replace-it) | Override any stage of session resolution. |
| `onUnauthenticated(req, session)` | — | Return a `NextResponse` to fully replace the default redirect. |
| `onUnauthorized(req, session, route)` | — | Same, for role/permission failures. |

## Auth pipeline: `jwt-decode` + `dayjs`, and how to replace it

By default, a request is authenticated by:

1. Reading the `cookieName` cookie.
2. If its value is JSON shaped like `{"access": "...", "refresh": "..."}`,
   decoding `refresh` (falls back to `access`/`token`); otherwise treating
   the whole value as a raw JWT.
3. Decoding it with `jwt-decode` and checking `exp` with `dayjs`.
4. Reading `payload.role` and `payload.permissions`.

**Important:** `jwt-decode` only decodes the payload — it does **not**
verify the signature. That's normally fine for middleware (a cheap
"is this worth letting through" check), as long as your actual API
verifies the signature on every request that matters. Don't treat a
passing middleware check as proof a token is genuine.

If you need real signature verification at the edge, pass a custom
`verifyToken` — the [`jose`](https://github.com/panva/jose) package
supports JWT signature verification in the Edge runtime (unlike
`jsonwebtoken`, which needs Node's `crypto` module and won't run in
middleware).

Every stage is overridable independently:

```js
createRouteGuardMiddleware({
  manifest,
  cookieName: 'session',
  getToken: (cookies, name) => cookies.get(name)?.value ?? null,
  decodeToken: (raw) => myCustomDecode(raw),
  verifyToken: (payload) => myCustomVerify(payload),
  getRole: (payload) => payload.user?.role,
  getPermissions: (payload) => payload.user?.scopes ?? [],
});
```

## Fine-grained overrides & Pages Router

`routeGuard.config.js` is a plain module — it does no file-system access,
so it's safe to import from Edge middleware. Use it for routes that need
"must have **all** of these" (AND) semantics rather than the
folder convention's default "any one of these" (OR), for one-off
exceptions, or — since there's no folder convention on the Pages Router —
as your entire route list there.

```js
// routeGuard.config.js
import { defineConfig } from 'route-group-guard';

export default defineConfig([
  {
    path: '/billing',
    access: 'private',
    permissions: ['view_billing', 'manage_billing'],
    permissionMode: 'all', // must have BOTH, not just one
  },
  { path: '/legacy-admin', access: 'private', roles: ['ADMIN'] },
]);
```

```js
// proxy.js  (middleware.js on Next.js <16 — see the note above)
import { createRouteGuardMiddleware } from 'route-group-guard';
import manifest from './route-guard.manifest.json'; // omit entirely on Pages Router
import overrides from './routeGuard.config.js';

export default createRouteGuardMiddleware({ manifest, overrides });
```

An override matches an existing manifest route by exact `path` and
replaces it entirely; one with no match is added as a new route — which
is exactly how Pages Router support works: pass `manifest: []` (or omit
it) and put your whole route list in `overrides`.

## Auto-sync via instrumentation.js

If you'd rather not add a `predev`/`prebuild` script, call the generator
from Next.js's [`instrumentation.js`](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
hook, which runs once when the server process boots:

```js
// instrumentation.js
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureManifest } = await import('route-group-guard/instrumentation');
    ensureManifest();
  }
}
```

The `NEXT_RUNTIME` check matters — `register()` also fires once under the
Edge runtime for edge-specific setup, and this needs `fs`. Since it only
runs at process start (not per request), a brand-new route folder added
while `next dev` is already running still needs a restart, or run
`route-group-guard generate --watch` in a second terminal.

## Pages Router

There's no folder convention to scan (Pages Router has no Route Groups),
so skip the CLI entirely and define your whole route list as `overrides`:

```js
// proxy.js  (middleware.js on Next.js <16 — the rename applies here too,
// since proxy/middleware sits in front of both routers)
import { createRouteGuardMiddleware } from 'route-group-guard';
import { defineConfig } from 'route-group-guard';

const routes = defineConfig([
  { path: '/', access: 'public' },
  { path: '/login', access: 'public' },
  { path: '/admindashboard', access: 'private', roles: ['ADMIN'] },
]);

export default createRouteGuardMiddleware({ overrides: routes });
```

## Migrating from a hand-written middleware

If you're coming from a `roleRoutes`-style middleware — redirecting each
role to a hardcoded list of paths it's allowed to visit — the closest
equivalent here is `getRoleHome`, used both when an authenticated user
lands somewhere they're not allowed and (via `redirectAuthenticatedFrom`)
when they visit a public-only page like `/login` while already signed
in:

```js
const roleHome = { ADMIN: '/admindashboard', DOCTOR: '/doctordashboard' };

createRouteGuardMiddleware({
  manifest,
  redirectAuthenticatedFrom: ['/login'],
  getRoleHome: (role) => roleHome[role],
});
```

The difference: instead of a flat allow-list per role that you update by
hand every time a route is added, each route declares its own
requirement by which folder it lives in, and the manifest is regenerated
automatically.

## Known limitations (v0.1)

- **Parallel routes** (`@slot`) and **intercepting routes** (`(.)x`,
  `(..)x`, `(...)x`) are intentionally skipped by the scanner — they
  don't have their own independently-navigable URL, so the canonical
  route already guards the URL they'd otherwise duplicate.
- Assumes `trailingSlash: false` (Next.js's default). If you've turned
  `trailingSlash: true` on, `/about/` and `/about` both still match
  today, but this hasn't been tested against every edge case of that
  config.
- `--watch` uses `fs.watch(dir, { recursive: true })`, whose recursive
  support varies by OS/Node version. If it's unavailable in your
  environment, re-run `route-group-guard generate` manually or wire it
  into `predev`.

## License

MIT
