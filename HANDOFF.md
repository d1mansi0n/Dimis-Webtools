# Handoff — state of the repository

Read [`README.md`](README.md) for what the project is,
[`CONTRIBUTING.md`](CONTRIBUTING.md) for how to work in it, and
[`CLAUDE.md`](CLAUDE.md) for the traps. This file covers what is _done_, what is
_deliberately not done_, and what to pick up next.

Last updated after a session that closed out the five open items the previous
version of this file listed — cross-browser end-to-end tests, the coverage
headroom, editable time entries, Sudoku hints and auto-notes, and the rice-bowl
illustration — and fixed two bugs that the first of those turned up.

## Start here

```bash
npm ci
npm run verify          # format, lint, typecheck, unit tests + coverage, build
npm run e2e:install     # once, downloads Chromium
npm run e2e             # Playwright on Chromium + mobile, against the built site
```

`npm run verify` is exactly what CI and the deploy both run — that is enforced by
both workflows calling this one command rather than listing the gates themselves.
If it passes locally it passes there.

`npm run e2e` runs two of the four projects, in about four minutes.
`npm run e2e:all` runs all four and takes about sixteen — it needs
`npm run e2e:install:all` first, and it is what CI and the deploy run. CI splits
it into four parallel jobs, so the wall-clock cost there is a browser download
rather than four suite runs. To debug one engine, use
`npx playwright test --project=webkit`.

## Where things stand

Everything below was measured, not assumed:

| Gate                   | Result                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| `npm run verify`       | passes                                                                          |
| Unit tests             | 546 passing, 22 files                                                           |
| Coverage               | 96.6% statements, 87.2% branches; thresholds 90/90/85/90                        |
| `npm run e2e:all`      | 338 passing, 6 skipped, across Chromium, Firefox, WebKit and a Pixel 7 viewport |
| `npm audit --omit=dev` | 0 vulnerabilities — the site has no runtime dependencies                        |
| `npm audit` (all)      | 0 vulnerabilities                                                               |

The six skips are deliberate and annotated where they are: three offline tests
that WebKit's harness cannot run (see below), and one touch gesture that needs a
touch-capable context, which is therefore skipped on the three desktop projects
and runs on the mobile one.

## The one thing outstanding

**Confirm the service worker actually registers on the live site.** It has only
ever run against `vite preview`, and it is the most persistent thing the site
ships — it outlives the tab that installed it.

1. Open the deployed site, then DevTools → **Application → Service Workers**.
   Expect one worker, **activated and is running**, source `sw.js`.
2. Application → **Cache Storage** should show one cache named `dwt-` plus a
   twelve-character hash, holding **27 entries**.
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

**Also worth one glance:** the CI workflow's end-to-end job is now a four-way
matrix, and workflow changes cannot be exercised locally. It parses, every `npm
run` and `npx` reference in it resolves, and the step order is right, but the
first run on `main` is the real test. A failure there fails the deploy rather
than publishing a bad site.

## What changed in the last session

The five open items this file used to list are done:

| Item                             | Outcome                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Only Chromium tested             | Firefox and WebKit added, as parallel CI jobs                                        |
| Branch coverage headroom         | 86.4% → 87.2%, against an unchanged threshold of 85%                                 |
| Time entries could not be edited | Comment unlocked, total editable, Stop undoable                                      |
| Sudoku had no hints              | Hints and auto-notes, both undoable, with assisted solves kept out of the best times |
| The rice illustration was gone   | Restored as a WebP banner, 1 MB → 39 kB                                              |

Four of those are worth knowing about because they were bugs found rather than
features added:

- **The Picture Counter's "choose an image" prompt never went away.** The code
  set `hidden` on it, but the stylesheet gives it `display: flex`, and an author
  `display` beats the user agent's `[hidden]` rule — so the attribute was set and
  the grey text went on sitting over the picture that had just loaded. The empty
  canvas had the same bug. It survived this long because the overlay is
  `pointer-events: none`, so it never swallowed a tap.
- **The test PNG the counter tests upload was corrupt.** Its `IDAT` chunk had a
  bad zlib checksum. Chromium decoded it anyway and Firefox refused it, so the
  tool had no image to place a marker on — a failure that looked like a browser
  difference in the tool and was nothing of the sort. This is what adding the
  second engine bought, on its first run.
- **Two service worker tests were proving their point through offline emulation
  they did not need.** They now read the Cache API directly, which is portable
  and a closer statement of what they mean. See the next section.
- **Answering a confirmation dialog by its button label alone races WebKit.** A
  click issued while the dialog is still being promoted into the top layer is
  swallowed, and the test then sits there until it times out — about two runs in
  five, and only ever on the second dialog of a test. `answerDialog()` in
  [`e2e/tools.spec.ts`](e2e/tools.spec.ts) waits for `dialog[open]` and for its
  removal; use it rather than clicking "Yes" directly. `confirmDialog()` itself
  is not at fault, which was checked rather than assumed.

## Things that will bite you

Most are written up in [`CLAUDE.md`](CLAUDE.md). The ones this session added:

- **Playwright's WebKit refuses a navigation made while `setOffline(true)`**,
  before the service worker is consulted at all — the call fails with "WebKit
  encountered an internal error" however complete the cache is. Three tests in
  [`e2e/offline.spec.ts`](e2e/offline.spec.ts) are skipped there for that reason,
  and the reason is written at the skip. The worker itself does intercept
  correctly on WebKit; that was verified by hand, by renaming a precached file
  out of `dist/` while online and watching the request still come back 200.
- **Firefox's offline emulation leaves its own HTTP cache answering.** The
  worker's `fetch` therefore succeeds for a page that was just visited, so
  network-first never reaches its fallback and an offline reload proves nothing
  about what is in the cache. Any test that wants to know what the cache holds
  should read it with `caches.match`, which works on every engine.
- **Running WebKit locally needs `libavif16` staged by hand** if the system does
  not have it. CI is unaffected, because it installs the browsers as root.
- **An author `display` beats `[hidden]`.** Setting the property is not enough on
  an element the stylesheet gives a `display` to; the stylesheet has to say
  `[hidden] { display: none }` itself. This has now bitten twice in one file.

And the ones that were already here and still cost the most time:

- **The service worker's precache list is injected by the build**, not written by
  hand. `src/sw.ts` ships two placeholder literals that a Vite plugin replaces
  once Rollup has emitted the hashed filenames. The build fails loudly if they are
  ever not found, because an unreplaced one ships a worker that caches nothing and
  reports nothing.
- **Cache lookups pass `ignoreVary: true`.** It is a fix, not a shortcut.
- **Every page has a gzipped budget** in `PAGE_BUDGETS` (`build/plugins.ts`). A new
  entry with no budget fails the build on purpose. Current headroom is ~5% on
  Sudoku, which is the tightest; `npm run build` prints the real weights.
- **No `new Intl.*` outside `core/format.ts` and `i18n/index.ts`.** ESLint errors
  on it.
- The Sudoku worker URL **must** be imported as `./generator.worker.ts?worker&url`.
- `vite preview` reports `command: 'serve'`; the config keys off `isPreview`.
- `optional()` in the schema module does not accept `null` — use `nullish()` in
  migration decoders, or every affected record is silently dropped.
- Header-only CSP directives must stay out of the `<meta>` policy.
- Never put raw control characters in source files.

## Open items, in the order I would take them

None of these are blocking, and the codebase is in good shape without them.

1. **Nothing automated covers offline behaviour on WebKit**, for the harness
   reason above. If the worker's strategy is ever changed, a WebKit-only
   regression would not be caught — the manual check in the previous section is
   the only cover. Worth redoing that check by hand after any change to
   `src/sw.ts`.
2. **Branch coverage has 2.2 points of headroom** (87.2% against a threshold of
   85%). Better than it was, but the next tool that lands with a few unexercised
   branches will still trip it, and it will look like an unrelated failure at an
   annoying moment. The right response is almost certainly to write the missing
   tests rather than lower the number.
3. **Time Tracking can correct an entry's total, but not its individual
   sessions.** The sessions are shown and are what the export reports start and
   end times from, so an entry whose total has been corrected can disagree with
   the sessions listed under it. That is deliberate — the sessions are the record
   of what actually happened — but it is the next thing someone will ask for.
4. **Sudoku's hint reveals a digit rather than explaining a technique.** The
   machinery for the better version already exists: `candidatesAt()` gives the
   pencil marks and `mostConstrainedCell()` finds the cell, so "this cell is the
   only place a 7 can go in this box" is reachable without new solving code.
5. **The rice bowl is the only raster asset on the site**, at 39 kB. If a second
   one is ever added, it is worth checking whether the precache should still
   carry images at all — 27 URLs is currently every asset the site has.

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
- **Sudoku hints are counted, and counting up only.** Undoing a hint puts the
  digit back but does not unsee it, and the count is saved with the game, so
  reloading a save is not a way to launder an assisted solve into a best time.
- **The service worker is not registered in development.** It would serve
  yesterday's modules over hot reload. Offline behaviour is therefore only
  observable through `npm run e2e`.
- **Language switching reloads the page.** Deliberate: every string is produced at
  render time, and a reload is correct by construction on a site with no server.
- **Dev-only `npm audit` findings are not chased.** Currently there are none; the
  reasoning for the policy is in `SECURITY.md`.
