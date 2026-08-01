# Handoff — state of the repository

Read [`README.md`](README.md) for what the project is,
[`CONTRIBUTING.md`](CONTRIBUTING.md) for how to work in it, and
[`CLAUDE.md`](CLAUDE.md) for the traps. This file covers what is _done_, what is
_deliberately not done_, and what to pick up next.

Last updated after a review pass focused on efficiency, security and the
machinery that keeps both from rotting. The previous version of this file was
written at the end of the 3.0 rewrite; its "no offline support yet" item is now
done, and its test counts were stale.

## Start here

```bash
npm ci
npm run verify          # format, lint, typecheck, unit tests + coverage, build
npm run e2e:install     # once, downloads Chromium
npm run e2e             # Playwright, against the production build
```

`npm run verify` is exactly what CI and the deploy both run — that is enforced by
both workflows calling this one command rather than listing the gates themselves.
If it passes locally it passes there.

## Where things stand

Everything below was measured, not assumed:

| Gate                   | Result                                                   |
| ---------------------- | -------------------------------------------------------- |
| `npm run verify`       | passes                                                   |
| Unit tests             | 502 passing, 22 files                                    |
| Coverage               | 96.7% statements, 86.4% branches; thresholds 90/90/85/90 |
| `npm run e2e`          | 157 passing, 1 skipped (Chromium + Pixel 7 viewport)     |
| `npm audit --omit=dev` | 0 vulnerabilities — the site has no runtime dependencies |
| `npm audit` (all)      | 0 vulnerabilities                                        |

## The one thing outstanding

**Confirm the service worker actually registers on the live site.** It is new, it
has only ever run against `vite preview`, and it is the most persistent thing the
site ships — it outlives the tab that installed it.

1. Open the deployed site, then DevTools → **Application → Service Workers**.
   Expect one worker, **activated and is running**, source `sw.js`.
2. Application → **Cache Storage** should show one cache named `dwt-` plus a
   twelve-character hash, holding **26 entries**.
3. Network → tick **Offline**, then navigate to a tool you have not opened in
   that browser. It should load normally — that exercises the precache rather
   than the page you are already on.

The specific failure worth ruling out is `sw.js` being served with a
non-JavaScript `Content-Type`; a service worker served as `text/plain` is
rejected outright and offline support silently never turns on. The Console says
so explicitly at registration if it happens.

If it is broken, the recovery is ordinary: pages are network-first, and the
worker script itself bypasses the HTTP cache on update checks, so a fix deploys
normally. Nobody gets stuck.

**Also worth one glance:** the CI and deploy workflows were changed in `6b31f03`
and are the only work from that session not proven by running it — GitHub Actions
cannot be exercised locally. Both files parse, every `npm run` reference in them
resolves, and the step order is right, but the first run on `main` is the real
test. A failure there fails the deploy rather than publishing a bad site.

## What changed in the last session

Seven commits, oldest first:

| Commit    | What                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------- |
| `90f262d` | Cached `Intl` formatters, made Recipes render only the visible panel, made the mention patterns lazy |
| `293cdea` | Added the page size budgets, the zero-runtime-dependency test, and the `Intl` lint rule              |
| `6bea875` | Added the axe sweep and a startup error boundary; fixed an invalid ARIA grid in Sudoku               |
| `3fc07d0` | Added the service worker — offline for the whole site                                                |
| `4379488` | Put the coverage thresholds into `npm run verify`, where they were promised                          |
| `57789d8` | Tested the service worker upgrade path; coalesced canvas painting to one per frame                   |
| `6b31f03` | Gave the gate one definition and made it gate the deploy too                                         |

Two of those are worth knowing about because they were bugs found rather than
features added:

- **The Sudoku board's ARIA was invalid.** All 81 cells were parented straight to
  `role="grid"`, but a grid may contain only rows. Screen readers had no defined
  way to walk it. Cells now sit in nine `role="row"` wrappers with
  `display: contents`, so the CSS grid is untouched and the board is
  pixel-identical.
- **The service worker cached everything and served none of it.** `vite preview`
  answers with `Vary: Origin`, the Cache API honours `Vary` by default, and the
  requests stored at install are `no-cors` and carry no `Origin` header while the
  browser's own module requests do. Every lookup missed: the HTML came back and
  every script alongside it failed. Lookups pass `ignoreVary: true` now. See
  `CLAUDE.md` — do not "tidy" it away.

## Open items, in the order I would take them

None of these are blocking, and the codebase is in good shape without them.

1. **Only Chromium is tested end to end.** Adding WebKit and Firefox projects to
   `playwright.config.ts` is a few lines; left out to keep CI fast. Worth doing
   before relying on Safari, particularly because Safari is where the
   `localStorage`-unavailable path actually triggers — and now also where service
   worker behaviour is most likely to differ.
2. **Branch coverage has 1.4 points of headroom** (86.4% against a threshold of
   85%). The next tool that lands with a few unexercised branches will trip it.
   When that happens the right response is almost certainly to write the missing
   tests rather than lower the number — but it will look like an unrelated failure
   at an annoying moment, so it is worth knowing in advance.
3. **Time Tracking has no way to edit a finished entry.** Stopping an entry locks
   its comment. That matches 2.0, but it is the most likely thing to frustrate
   someone using it in anger.
4. **Sudoku has no hint or auto-notes feature.** Both are common expectations, and
   `generator.ts` already provides everything needed: `solve()` gives the answer
   for a hint, and the candidate masks give the digits for auto-notes.
5. **The rice-bowl illustration was deleted** in the 3.0 rewrite (a 1 MB
   unoptimised PNG used as a full-page background). Recoverable from
   `v1.0-archive`. If it comes back, convert it to WebP and treat it as a
   decorative header, not a background — full-bleed backgrounds hurt text
   contrast, which is why the old version needed a translucent panel over it.

## Things that will bite you

All written up in [`CLAUDE.md`](CLAUDE.md); the ones that cost the most time:

- **The service worker's precache list is injected by the build**, not written by
  hand. `src/sw.ts` ships two placeholder literals that a Vite plugin replaces
  once Rollup has emitted the hashed filenames. The build fails loudly if they are
  ever not found, because an unreplaced one ships a worker that caches nothing and
  reports nothing.
- **Cache lookups pass `ignoreVary: true`** for the reason above. It is a fix, not
  a shortcut.
- **Every page has a gzipped budget** in `PAGE_BUDGETS` (`build/plugins.ts`). A new
  entry with no budget fails the build on purpose. Current headroom is ~15%;
  `npm run build` prints the real weights.
- **No `new Intl.*` outside `core/format.ts` and `i18n/index.ts`.** ESLint errors
  on it. Constructing a formatter per call is tens of microseconds and lands in
  render loops.
- The Sudoku worker URL **must** be imported as `./generator.worker.ts?worker&url`.
- `vite preview` reports `command: 'serve'`; the config keys off `isPreview`.
- `optional()` in the schema module does not accept `null` — use `nullish()` in
  migration decoders, or every affected record is silently dropped.
- Header-only CSP directives must stay out of the `<meta>` policy.
- Never put raw control characters in source files.

## Deliberate non-goals

Worth knowing so they are not "fixed" by accident:

- **No runtime dependencies.** A security property, not an oversight, and now a
  test (`build/dependencies.test.ts`). Note the one gap that test cannot close: a
  _dev_ dependency that emits _runtime_ code. That is why the service worker is
  hand-written rather than generated by Workbox.
- **No framework.** Six small tools with no shared client state do not need one,
  and `core/dom.ts` is what makes the Trusted Types guarantee hold.
- **The Sudoku radial picker stays.** It is the owner's own design and the reason
  the tool exists. An earlier draft replaced it with a number pad; that was
  reverted at the owner's request. Do not remove it again.
- **The service worker is not registered in development.** It would serve
  yesterday's modules over hot reload. Offline behaviour is therefore only
  observable through `npm run e2e`.
- **Language switching reloads the page.** Deliberate: every string is produced at
  render time, and a reload is correct by construction on a site with no server.
- **Dev-only `npm audit` findings are not chased.** Currently there are none; the
  reasoning for the policy is in `SECURITY.md`.
