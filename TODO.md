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
118 tests total (pure-logic + storage/aiRouter/wearLog/xss DOM-dependent ones).

## Explicitly not doing (for now)

- Encrypting BYOK API keys in IndexedDB — inherent to a no-server
  architecture, already disclosed in the UI copy.
- Hardening `camera.js`'s cancel detection — already documented as
  best-effort, low impact.

## Next up

### Features

- [x] Full outfit builder, not just pairs — `matcher.js`'s `scoreOutfit`/
      `buildOutfit` combine pairwise scoring across top+bottom+shoes (plus
      outerwear/accessory when they raise the average). Surfaced as a
      "Build an outfit" mode in the Suggest tab.
- [x] Wardrobe search/filter beyond the category chips — a collapsible
      filters panel adds formality and color-family chips (`colorMatch.js`'s
      new `colorFamily()` bucketing), plus a text search over notes/
      subCategory. See `wardrobeView.js`.
- [x] Outfit history / "worn today" log — a new `history` IndexedDB store
      (`storage.js`) plus `wearLog.js`'s `logWorn()`, wired to "Mark as worn
      today" on the item detail view, the surprise pairing, and the outfit
      builder. Each item gets a `lastWorn` stamp; a 📜 button in the wardrobe
      toolbar opens the full log (`historyView.js`).
- [x] Seasons/weather tagging — `matcher.js` adds a `SEASONS` field
      (warm-weather/all-season/cold-weather) and a `seasonPenalty()` that
      folds into `scoreMatch`/`scoreOutfit`, mirroring how formality already
      works. `seasonField.js` mirrors `formalityField.js`'s UI (manual
      select only, no AI-suggest button since there's no photo-classifier
      hook for weather the way there is for formality).

### Quality/UX polish

- [x] Consistent empty/loading states across the app — `aiChatView.js`'s
      `render()` now shows a loading row immediately instead of awaiting
      `getAiConfig()` before touching the DOM at all (previously the only
      view that let the *previous* tab's content flash while it loaded).
      Also added the `empty-emoji` icon to five empty-states that were
      missing it (chat empty thread, cleanup "add items first", AI review
      "couldn't parse", capture "couldn't read photo", surprise "no
      compatible pairing") for consistency with every other empty-state.
- [x] Undo for delete — wardrobe item detail delete and the cleanup-scan
      duplicate delete both now delete immediately (no blocking `confirm()`)
      and show a 5-second "Undo" toast (`domUtil.js`'s `showUndoToast`) that
      re-adds the item if pressed.
- [x] Accessibility pass — color swatches (`renderSwatches`, the capture-form
      preview, and the AI-review color-suggestion cards) were bare
      `<span>`s with only a hover `title`, so screen readers announced
      nothing and touch users got no tooltip at all; they now carry
      `role="img"` + an `aria-label` built from `colorFamily()` (e.g. "red
      swatch, #ff0000"). Also marked all purely-decorative emoji (nav icons,
      mode-card icons, empty-state icons) `aria-hidden="true"` so screen
      readers don't announce redundant glyphs next to their adjacent text.
- [x] AI-thinking nav badge — while the AI tab is waiting on a provider
      reply (chat send or wardrobe-cleanup scan) and the user has navigated
      to another tab, a small pulsing dot appears on the AI nav icon
      (`fitted:ai-thinking` event, wired in `main.js`). Also fixed a latent
      bug this surfaced: replying while the chat view had been navigated
      away from and its DOM replaced would throw (`renderThreadOnly` on a
      detached `#chat-thread`); both `send()` and `renderThreadOnly` now
      guard against that.

### Technical

- [ ] CI — a GitHub Actions workflow running `npm test` on push/PR, since
      nothing runs the test suite automatically yet.
- [ ] Lint/format config (ESLint + Prettier or Biome) now that there's a
      `package.json` — would catch things like unused imports before they ship.

## AI-review UX fixes (user feedback)

- [x] Removed the standalone formality "✨ Suggest" button from the wardrobe
      **detail** view (`formalityField.js` now takes a `showAiSuggest`
      option) — it was a second, confusing AI entry point once "Re-check
      with AI" existed. Kept it in the capture form, since there's no
      "check with AI" alternative before the item is saved.
- [x] "Re-check with AI" (`aiReview.js`) now also suggests formality (the
      one thing the standalone button used to cover), and its prompt asks
      for a more *descriptive* sub-category even when the current one
      isn't wrong (e.g. "long pants" -> "chinos"), not just corrections.
- [x] Fixed the bug where applying one AI-review suggestion wiped out the
      other still-pending ones: `wardrobeView.js` was tearing down and
      re-creating the whole detail overlay (`refreshDetail()`) on every
      apply. It now only patches the pattern/sub-category pills, swatches,
      and formality select in place (`syncDetailSummary()`), leaving the
      rest of the AI-review panel untouched.
- [x] Added an "Apply all" button to the AI-review panel when there's more
      than one pending suggestion, so fixes don't have to be applied one
      at a time.

## Also considered, not queued

- Export/import wardrobe data (JSON backup, since everything lives in
  per-browser IndexedDB with no sync).
