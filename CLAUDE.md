# Fitted

A no-build, dependency-free PWA (vanilla JS, IndexedDB, canvas-based color/
pattern extraction, BYOK AI chat). See `TODO.md` for open hardening/test/
feature work.

## Rules

- **Bump the version on every change that ships to users.** Increment
  `VERSION` in `js/version.js` (e.g. `'v9'` -> `'v10'`) and `CACHE_NAME` in
  `sw.js` (e.g. `'fitted-cache-v9'` -> `'fitted-cache-v10'`) together, in the
  same commit as the change. The topbar version stamp and the service
  worker's cache-busting both depend on this; skipping it means the PWA can
  keep serving stale cached JS after a deploy.
- If a change adds or removes a file under `js/` or `css/`, update `sw.js`'s
  `PRECACHE_URLS` list to match. `tests/sw.test.js` checks this stays in
  sync and will fail if you forget.
- Run `npm test` (Node's built-in `node:test` runner, no build step) before
  committing.
