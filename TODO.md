# TODO

## Hardening

- [x] Fix stored XSS: `subCategory` is rendered via `innerHTML` unescaped in
      `wardrobeView.js`, `matchView.js`, and `aiChatView.js`. `notes` is
      already escaped everywhere; `subCategory` never is.
- [x] Close the same hole for AI-suggested fixes: the wardrobe-cleanup and
      per-item "re-check with AI" flows apply `subCategory`/`notes` values
      straight from the AI's JSON reply with no sanitization, then hit the
      same unescaped render path. Cap length + rely on the escaping fix above.
- [x] Fix blob URL leak: `URL.createObjectURL(item.thumbnail)` is called on
      every grid/detail/match/chat render and never revoked. Add a
      revoke-on-load helper and use it at every thumbnail render site.
- [x] Add a top-level error boundary around tab rendering in `main.js` so a
      thrown error (bad IndexedDB state, etc.) doesn't leave a blank screen.
- [x] Add a test that keeps `sw.js`'s hand-maintained `PRECACHE_URLS` list in
      sync with the actual files on disk, so a forgotten new file doesn't
      silently break offline install.
- [x] Extract a shared `CATEGORIES`/`PATTERNS` constants module — currently
      copy-pasted across `matcher.js`, `wardrobeView.js`, `captureView.js`,
      `aiChatView.js`.
- [x] Add length caps on `notes`/`subCategory` before they're written to
      IndexedDB (capture form + AI-suggested values).

## Tests (currently zero coverage)

- [x] `matcher.js` — category compatibility, pattern penalty, formality gap
      penalty, `findMatches` ordering/limit/self-exclusion, `pickSurpriseCombo`.
- [x] `colorMatch.js` — hex/HSL conversion, hue distance wraparound, neutral
      detection, weighted multi-color harmony scoring.
- [x] `imageProcess.js` — `extractDominantColors` and `detectPattern` against
      small synthetic `ImageData`-shaped fixtures (solid vs. striped vs.
      noisy-but-solid).
- [x] `explain.js` — phrase generation for each score bucket/relation.
- [x] `storage.js` — IndexedDB wrapper via `fake-indexeddb`; add/update/delete/
      get/settings + legacy `aiConfig` migration (covered in
      `tests/storage.test.js` and `tests/aiRouter.test.js`).
- [x] XSS regression test covering the subCategory fix above
      (`tests/xss.test.js`, uses `jsdom`).

Run with `npm test` (Node's built-in `node:test` runner, no build step).
73 pure-logic tests + 5 DOM-dependent tests (storage/aiRouter/xss), 78 total.

## Explicitly not doing (for now)

- Encrypting BYOK API keys in IndexedDB — inherent to a no-server
  architecture, already disclosed in the UI copy.
- Hardening `camera.js`'s cancel detection — already documented as
  best-effort, low impact.

## Ideas for later (not started)

- Full multi-item outfit suggestions (top+bottom+shoes+outerwear) instead of
  just pairs.
- Wardrobe search/filter beyond the category chips (color, formality, notes).
- Export/import wardrobe data (JSON backup, since everything lives in
  per-browser IndexedDB with no sync).
