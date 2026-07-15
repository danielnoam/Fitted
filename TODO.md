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

## Next up (not started)

### Features

- [ ] Full outfit builder, not just pairs — extend `matcher.js`'s pairwise
      scoring into a "build a full fit" mode (top + bottom + shoes +
      optional outerwear/accessory) across 3-4 slots at once.
- [ ] Wardrobe search/filter beyond the category chips — filter by color,
      formality, or pattern; text search over notes/subCategory.
- [ ] Outfit history / "worn today" log — track what was actually worn, to
      avoid repeats and eventually surface "you haven't worn this in months."
- [ ] Seasons/weather tagging — same mechanism as the existing formality
      field/AI-suggest button, gates suggestions by season.

### Quality/UX polish

- [ ] Consistent empty/loading states across the app — the `#suggest-more`
      flow and AI settings screen should use the same skeleton/loading
      treatment already used elsewhere.
- [ ] Undo for delete — item deletion (wardrobe detail, cleanup-scan
      duplicates) is immediate behind only a `confirm()`; add a brief "Undo"
      toast, especially since there's no export/backup yet.
- [ ] Accessibility pass — color-swatch-only UI (category badges, formality
      pills) needs more than a hover `title` for touch/screen-reader users.

### Technical

- [ ] CI — a GitHub Actions workflow running `npm test` on push/PR, since
      nothing runs the test suite automatically yet.
- [ ] Lint/format config (ESLint + Prettier or Biome) now that there's a
      `package.json` — would catch things like unused imports before they ship.

## Also considered, not queued

- Export/import wardrobe data (JSON backup, since everything lives in
  per-browser IndexedDB with no sync).
