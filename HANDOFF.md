# Handoff — state of the repository

Written at the end of the 3.0 rewrite. Read [`README.md`](README.md) for what the
project is, [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to work in it, and
[`CLAUDE.md`](CLAUDE.md) for the traps. This file covers what is _done_, what is
_deliberately not done_, and what to pick up next.

## Where things stand

The repository was rewritten from standalone HTML files into a TypeScript site
built by Vite, on the branch `rewrite/v3-typescript`. Everything below is verified,
not assumed:

| Gate                   | Result                                              |
| ---------------------- | --------------------------------------------------- |
| `npm run verify`       | passes (format, lint, typecheck, unit tests, build) |
| Unit tests             | 382 passing, 17 files                               |
| Coverage               | ~95% statements; thresholds 90/90/85/90 enforced    |
| `npm run e2e`          | 94 passing (Chromium + Pixel 7 viewport)            |
| `npm audit --omit=dev` | 0 vulnerabilities — the site has no runtime deps    |

Decisions taken with the owner, so they do not need relitigating:

- **One version per tool.** The 1.0/2.0 toggle is gone; 2.0 behaviour is the tool.
  The originals live at the `v1.0-archive` tag.
- **TypeScript + Vite + CI.** Accepted trade-off: source is no longer editable in
  the GitHub web UI.
- **Full DE/EN i18n**, browser-detected and overridable.
- **The Sudoku radial picker stays.** It is the owner's own design and the reason
  the tool exists — number entry in other Sudoku apps is inefficient. An earlier
  draft of this rewrite replaced it with a number pad; that was reverted at the
  owner's request. Do not remove it again. See `CLAUDE.md`.

## Before this goes live

Two steps that need repository access, neither of which can be done from a clone:

1. **Push the archive tag**: `git push origin v1.0-archive`. Without it the
   `README` and `CHANGELOG` links to the old code point nowhere.
2. **Switch GitHub Pages to "GitHub Actions"** as its source (Settings → Pages).
   Until then `deploy.yml` will build successfully and publish nothing.

Then check the deployed site once by hand: the base path is `/Dimis-Webtools/`,
and if a custom domain is ever added, `BASE_PATH` must be set to `/` in
`deploy.yml`.

## Open items, in the order I would take them

1. **The rice-bowl illustration was deleted.** The old Rice tool used a 1 MB
   unoptimised PNG as a full-page background; the new design has no place for it,
   so it was removed. It is recoverable from `v1.0-archive`. If the owner wants it
   back, convert it to WebP (~50 KB) and treat it as a decorative header, not a
   background — full-bleed background images hurt text contrast, which is why the
   old version needed a translucent white panel over it.
2. **No offline support yet.** The tools work offline once loaded, but there is no
   service worker, so a cold start needs the network. A precache service worker
   would make this genuinely installable — the manifest is already in place. Note
   that it interacts with the Content Security Policy and with cache invalidation
   on deploy, so it deserves its own change rather than being tacked on.
3. **Time Tracking has no way to edit a finished entry.** Stopping an entry locks
   its comment. That matches 2.0, but it is the most likely thing to frustrate
   someone using it in anger.
4. **Sudoku has no hint or auto-notes feature.** Both are common expectations, and
   the solver in `generator.ts` already provides everything needed to build them:
   `solve()` gives the answer for a hint, and `isLegalPlacement` gives candidate
   digits for auto-notes.
5. **Only Chromium is tested end to end.** Adding WebKit and Firefox projects to
   `playwright.config.ts` is a few lines; it was left out to keep CI fast. Worth
   doing before relying on Safari, particularly because Safari is where the
   `localStorage`-unavailable path actually triggers.
6. **`export.ts` in Time Tracking has the lowest coverage** (~82%), all of it in
   `downloadWorkbook`, which is Blob and anchor plumbing covered by an e2e test.
   Fine as it stands; mentioned so the number is not a surprise.

## Things that will bite you

These are all written up in `CLAUDE.md`, repeated here because they cost real time:

- The Sudoku worker URL **must** be imported as `./generator.worker.ts?worker&url`.
  Writing `new Worker(new URL(...))` and passing it through a helper defeats Vite's
  static detection and ships the raw `.ts` file, which the browser refuses to run.
- `vite preview` reports `command: 'serve'`. The config keys off `isPreview` to get
  the base path right; getting this wrong 404s every asset, and the e2e suite runs
  against preview.
- `optional()` in the schema module does not accept `null`. JSON has no
  `undefined`, so data from the old tools is full of explicit nulls — migration
  decoders need `nullish()`. Getting this wrong silently drops every record.
- Header-only CSP directives must stay out of the `<meta>` policy; they are ignored
  _and_ logged as errors.
- Never put raw control characters in source files — it makes them binary to `grep`.

## Deliberate non-goals

Worth knowing so they are not "fixed" by accident:

- **No runtime dependencies.** This is a security property, not an oversight. The
  `.xlsx` writer exists precisely so the site does not load third-party code.
  Adding to `dependencies` should be an explicit decision.
- **No framework.** Five small tools with no shared client state do not need one,
  and the `core/dom.ts` builder is what makes the Trusted Types guarantee hold.
- **Dev-only `npm audit` findings are not chased.** CI fails on production
  advisories and reports dev ones. Forcing the one "fix" available broke the
  coverage reporter; the reasoning is in `SECURITY.md`.
- **Language switching reloads the page.** Deliberate: every string is produced at
  render time, and a reload is correct by construction on a site with no server.
