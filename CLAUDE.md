# Notes for AI assistants working in this repository

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first — it holds the actual conventions.
This file only lists the things that are easy to get wrong here.

## Commands

```bash
npm run verify   # format, lint, typecheck, unit tests, build — the CI gate
npm run e2e      # Playwright on Chromium + mobile, against the production build
npm run e2e:all  # all four projects, as CI and the deploy run them
```

Never claim work is done without running `npm run verify`. It is fast.

## Constraints that are enforced, not advisory

- **No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` or `document.write`.**
  ESLint errors on them, and the Content Security Policy blocks them at run time
  via Trusted Types. Build DOM with [`src/core/dom.ts`](src/core/dom.ts).
- **No inline `<script>`, `<style>` or `style` attribute.** The build fails on them,
  because the policy would block them silently on the deployed site.
- **No runtime dependencies.** The site ships zero third-party JavaScript, and that
  is a deliberate security property, not an accident. Adding one to `dependencies`
  needs an explicit decision from the maintainer. Dev dependencies are fine.
  [`build/dependencies.test.ts`](build/dependencies.test.ts) fails on any runtime
  dependency field, so this is a test, not a preference.
- **Every page has a gzipped size budget** in `PAGE_BUDGETS`
  ([`build/plugins.ts`](build/plugins.ts)), and the build fails when a page exceeds
  it — or when a new entry has no budget at all. Raising a number is fine; it just
  has to be a decision. `npm run build` prints each page's real weight.
- **No `new Intl.*` outside [`core/format.ts`](src/core/format.ts) and
  [`i18n/index.ts`](src/i18n/index.ts).** Formatters are built once per locale and
  cached there; constructing one per call is tens of microseconds each and lands
  in render loops. ESLint errors on it.
- **No `alert`/`confirm`/`prompt`.** Use `confirmDialog()` from
  [`src/shell/dialog.ts`](src/shell/dialog.ts).
- **Every page is swept by axe** ([`e2e/accessibility.spec.ts`](e2e/accessibility.spec.ts)),
  derived from `PAGES`, so a new tool is enrolled automatically. If you reach for
  ARIA roles, implement the whole pattern — a `gridcell` outside a `row` is a
  violation, and that is a real bug this suite caught.
- **No hardcoded user-visible strings.** Add a key to
  [`src/i18n/en.ts`](src/i18n/en.ts); `de.ts` will then fail to compile until it is
  translated, which is intended.
- **No unvalidated `localStorage` reads.** Use `defineStore` with a schema.

## Things that have bitten before

- **The Sudoku worker URL must be imported as `./generator.worker.ts?worker&url`.**
  Writing `new Worker(new URL('./generator.worker.ts', import.meta.url))` and
  wrapping it in a function defeats Vite's static detection, and it silently emits
  the raw `.ts` file as an asset, which the browser then refuses to execute. The
  `Worker` call also has to go through `trustedWorkerUrl()`, because the constructor
  is a Trusted Types sink.
- **`vite preview` reports `command: 'serve'`** even though it serves the built
  output. `vite.config.ts` uses `isPreview` to get the base path right; testing
  `command` alone makes every asset 404 under preview, which is what the e2e suite
  runs against.
- **Header-only CSP directives must stay out of the meta policy.** `frame-ancestors`
  and friends are ignored in a `<meta>` tag _and_ logged as an error on every page
  load. [`build/csp.ts`](build/csp.ts) strips them.
- **`optional()` does not accept `null`.** JSON has no `undefined`, so data written
  by the old tools is full of explicit `null`s. Use `nullish()` in migration
  decoders — getting this wrong silently discards every affected record.
- **`DOMException` is not `instanceof Error` across realms** (including in jsdom).
  Storage error classification duck-types instead.
- **A cell only opens the radial picker if the pointer gesture _started_ on it**
  (`gestureStartedOnCell`). After the ring closes, the browser emits a
  compatibility `click` for the same gesture, and on touch it hit-tests the
  coordinates _after_ the ring has gone — so the erase button at the centre lands
  its click on the very cell that opened the ring and reopened it. Do not replace
  this with a timing window; a window long enough to be reliable also swallows a
  fast tap on the next cell.
- **The Sudoku radial picker is the point of that tool — do not "simplify" it into
  a number pad.** Tapping a cell opens a ring of digits at that spot so the digits
  come to the finger; holding a digit writes a note instead of an answer. Its
  overlay sits above the board, so a second tap on the same cell never reaches the
  cell — dismissal is via the overlay or Escape. Only the overlay path arms the
  reopen guard; arming it on every close puts dead time between consecutive entries
  and makes e2e tests flaky.
- **The service worker's precache list is injected by the build, not written by
  hand.** [`src/sw.ts`](src/sw.ts) ships two placeholder literals that
  `serviceWorkerManifest` ([`build/plugins.ts`](build/plugins.ts)) replaces once
  Rollup has emitted the hashed filenames — `define` cannot do it, because the
  hashes do not exist until after transform. The build fails loudly if the
  placeholders are ever not found, because a silently unreplaced one ships a
  worker that caches nothing and reports nothing.
- **Cache lookups pass `ignoreVary: true`.** `vite preview` answers with
  `Vary: Origin`, the precache stores `no-cors` requests that carry no `Origin`,
  and the browser's own module requests do — so without it every lookup misses
  and the site is cached but unusable offline, serving the HTML while every
  script alongside it fails. Do not "tidy" it away.
- **An author `display` beats `[hidden]`.** Setting `element.hidden = true` does
  nothing to an element the stylesheet gives a `display` to — the user agent's
  `[hidden] { display: none }` is a weaker cascade origin, so it always loses.
  The stylesheet has to say it itself. This shipped in the Picture Counter, where
  the "choose an image" prompt went on sitting over the picture that had just
  loaded, and nobody noticed because the overlay is `pointer-events: none` and so
  never swallowed a tap.
- **Playwright's WebKit refuses offline navigations before the service worker
  sees them.** `context.setOffline(true)` followed by a navigation fails with
  "WebKit encountered an internal error" however complete the cache is, so three
  tests in [`e2e/offline.spec.ts`](e2e/offline.spec.ts) are skipped there.
  **Firefox has the opposite problem:** its offline emulation leaves its own HTTP
  cache answering, so the worker's `fetch` succeeds for a page that was just
  visited and network-first never reaches its fallback. A test that wants to know
  what is in the cache must read it with `caches.match`, not infer it from an
  offline navigation.
- **Don't put raw control characters in source files.** It makes them binary to
  `grep` and other tools. Write them as `\u0000`-style escape sequences instead.

## Style

Comment the _why_. Several comments here point at specific defects in the previous
version of the code; that is the standard. Prose in comments and documentation
should read as full sentences, and test names should be statements about behaviour.
