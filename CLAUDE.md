# Notes for AI assistants working in this repository

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first — it holds the actual conventions.
This file only lists the things that are easy to get wrong here.

## Commands

```bash
npm run verify   # format, lint, typecheck, unit tests, build — the CI gate
npm run e2e      # Playwright, against the production build
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
- **No `alert`/`confirm`/`prompt`.** Use `confirmDialog()` from
  [`src/shell/dialog.ts`](src/shell/dialog.ts).
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
- **The Sudoku radial picker is the point of that tool — do not "simplify" it into
  a number pad.** Tapping a cell opens a ring of digits at that spot so the digits
  come to the finger; holding a digit writes a note instead of an answer. Its
  overlay sits above the board, so a second tap on the same cell never reaches the
  cell — dismissal is via the overlay or Escape. Only the overlay path arms the
  reopen guard; arming it on every close puts dead time between consecutive entries
  and makes e2e tests flaky.
- **Don't put raw control characters in source files.** It makes them binary to
  `grep` and other tools. Write them as `\u0000`-style escape sequences instead.

## Style

Comment the _why_. Several comments here point at specific defects in the previous
version of the code; that is the standard. Prose in comments and documentation
should read as full sentences, and test names should be statements about behaviour.
