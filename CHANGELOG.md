# Changelog

## Unreleased

### Sudoku will now help, and says when it did

- **A hint fills in one correct digit.** It lands on the cell with the fewest
  remaining candidates rather than the first empty one in reading order, because
  that is the cell a player would have found next themselves — revealing it shows
  the step instead of skipping past it. The message names the row and column, so
  it is clear what changed without hunting for it.
- **Hinted cells are marked**, and a solve that used hints is not offered as a
  best time; it is reported as "solved in 12:04 with 2 hints" instead. The count
  only goes up — undoing a hint puts the digit back but does not unsee it — and
  it is saved and loaded with the game, so reloading is not a way to launder a
  hint into a best time.
- **Fill notes pencils every still-legal digit into every empty cell.** It works
  the same way a player does it by hand and deliberately does not consult the
  solution: a note records what a cell _might_ be, not a leaked answer.
- **Undo steps back one thing you did, not one cell.** Filling notes across
  eighty cells used to be undoable only in principle; a move is now a set of
  cells, so one press takes the whole thing back. Pressing Fill notes when every
  cell already says exactly that adds no undo step at all.
- Games saved before hints existed load as what they were — unassisted — rather
  than failing to load.

### A finished time entry can be corrected

- **The comment is no longer locked when the timer stops.** Versions 1.0 and 2.0
  sealed it at that moment, which was the sharpest edge this tool had: writing
  down what a stretch of work was about is something people do once it is over.
- **The recorded total is editable on a finished entry**, in whichever format is
  on screen — `HH:MM:SS` or a decimal number of hours. The case it exists for is
  a timer left running through lunch, where the only previous remedy was deleting
  the entry and losing the comment and the session times with it. The recorded
  sessions are kept, because they are the evidence of what actually happened.
- **An unreadable duration is refused rather than stored as zero.** The field
  reverts and says what it wanted. Corrections are committed when you leave the
  field, not on every keystroke, since half-typed input is always invalid.
- **Stop is undoable.** It sits one click from Pause and is easy to hit by
  accident; Reopen makes the entry writable again without touching the time
  already banked.
- A running entry keeps its read-only read-out — a field the heartbeat overwrites
  a second later would be a trap — and a finished entry's field is left alone
  while it has focus.

### The rice bowl is back

- **The illustration deleted in the 3.0 rewrite has returned**, as a banner
  across the top of the card rather than the full-page background it used to be.
  As a background it sat under the whole converter and the text on top only
  became legible once a translucent panel was laid over the lot; nothing is
  written over it now, so it costs no contrast anywhere.
- **1 MB of unoptimised PNG is now 39 kB of WebP.** It is decorative, so its
  `alt` is empty and screen readers skip it, and it declares its intrinsic size
  so the layout does not jump as it loads. It is dimmed slightly in the dark
  theme, where its bright cyan ground would otherwise glare.

### The Picture Counter's prompt goes away when the picture arrives

- **"Choose an image to start counting" no longer sits on top of the image you
  just chose.** The code had always set the prompt's `hidden` property, but the
  stylesheet gives it a `display`, and an author `display` beats the browser's
  own `[hidden]` rule — so the attribute was set and nothing happened. The empty
  canvas underneath had the same bug. Both are spelled out in the stylesheet now,
  and an end-to-end test checks the prompt is gone once a picture has loaded.

### The accent colour is yours to pick

- **A colour control sits beside the theme button** on every page: six presets —
  ocean, teal, forest, amber, rose and violet — plus the operating system's own
  colour picker for anything else. The choice applies as you make it, with the
  page visible around the dialog, and is remembered per device. The default is
  now a blue rather than the old indigo.
- **Only the seed colour is stored.** The six accent tokens — the hover shade,
  the soft tint, the control fill, the halo behind the page and the text drawn on
  top of the accent — are derived from it per theme in
  [`core/color.ts`](src/core/color.ts), so one setting themes both the light and
  the dark palette and neither has to be tuned by hand.
- **The derivation checks its own work.** It runs in OKLCH, keeps the hue, caps
  the chroma and then walks the lightness until the accent clears 4.5:1 against
  the surface it sits on _and_ against its own soft tint. A pale yellow picked in
  the light theme comes back dark enough to read; the same yellow in the dark
  theme comes back light enough. Tests assert this for a spread of seeds,
  including black, white and pure yellow, in both themes.
- **`tokens.css` still declares the default accent**, so the first frame is
  painted before any script runs, and a build-side test fails if what the
  stylesheet says stops matching what the derivation produces.

### Own items on the shopping list

- **Anything can be put on the list by hand**, into whichever aisle it will be
  picked up in, and ticked off like everything else. Own items carry a coloured
  spine, a lighter row tint and a "yours" badge, so they are distinguishable from
  the recipe ingredients they sit beside without breaking the rhythm of the list —
  and the badge says it in words for anyone who cannot see the colour. They are
  never scaled by the person count, because "2 packs" is a note, not an amount.
- **The two halves of the list clear separately.** Ingredients and own items have
  their own button, the cupboard staples theirs. One button for both meant that
  clearing a finished shopping trip also wiped which staples were still in.

### A refreshed look

- **New palette** in both themes: warmer neutrals, a brighter indigo accent, a
  soft halo behind the page, and two-layer shadows that read as depth at far
  lower opacity than one big blur. Every foreground/background pair still meets
  WCAG AA for body text, checked numerically rather than by eye.
- **Checkboxes are drawn rather than native.** `accent-color` only tints the
  _checked_ fill, so a list of unticked boxes was a column of near-black squares
  in the light theme. The box now uses the palette, and the tick is a real
  element beside the input — Firefox will not render a pseudo-element inside an
  `<input>`, and a tick that works in three browsers out of four is worse than a
  native one.
- **`--border-strong` now meets the 3:1** that WCAG asks of a control's outline;
  the lighter `--border` stays for card edges, where nothing is identified by it.
- **The dark theme's danger colour no longer carries white text.** It is a light
  red, and white on it measured 2:1; there is now a `--text-on-danger` that flips
  with the theme the way `--text-on-accent` does.
- **The hub's app bar no longer repeats the site name** a few pixels above the
  heading that already says it.
- No JavaScript was added for any of this, and no assets: the whole refresh is
  the token file plus the shared component sheet.

### Added: Recipes & Shopping List

A sixth tool, built from a standalone HTML page of vegan recipes. Choose what you
want to cook and the shopping list adds every ingredient up, grouped by aisle,
with ticks that survive a reload.

- **Amounts scale with the number of people, inside the recipe as well as on the
  list.** The imported version scaled only the shopping list; the ingredient list
  in an opened recipe was fixed at one portion and labelled as such, so cooking
  for three meant doing the arithmetic by hand.
- **Cooking amounts and shopping amounts round differently.** A recipe asks for
  half an avocado and two thirds of a tin of chickpeas, because that is what it
  uses; the shopping list asks for one avocado and one tin, because that is what
  a shop sells. Ingredients are summed across recipes _before_ rounding, so two
  recipes needing half an onion each buy one onion rather than two.
- **Recipes can no longer be typed in.** They are curated in `data.ts` with their
  ingredients in catalogue units, which is what lets them be added up and scaled
  at all. The old free-text recipes could be neither, and ended up in a separate
  section of the list that never responded to the person count.
- **Fixed recipes that cooked with ingredients they never bought.** The avocado
  toast squeezed a lemon and the bean salad was tossed with salad leaves, neither
  of which was on any list; three more reached for soy sauce, curry powder and
  dried herbs that were not even cupboard staples. A test now checks every
  method, in both languages, against the ingredients the recipe actually shops
  for, so the next recipe added cannot reintroduce the gap.
- Both languages throughout, including every recipe name and method step.

### Engineering

- **The end-to-end suite runs on three engines, not one.** Firefox and WebKit
  join Chromium and the Pixel 7 viewport. CI runs them as four parallel jobs, so
  the wall-clock cost is a browser download rather than three more suite runs,
  and one engine's failure no longer hides another's.
- **`npm run e2e` stays fast, though.** All four projects take about sixteen
  minutes, which is not a price worth paying on every change to a site of six
  small tools. The default is Chromium plus the mobile viewport, at about four;
  `npm run e2e:all` is the full sweep, and is what CI and the deploy run.
- **It found a bug in its own fixture first.** The test PNG the Picture Counter
  tests upload had a corrupt zlib checksum: Chromium decoded it anyway, Firefox
  refused it, and the tool then had no image to put a marker on. It looked like a
  browser difference in the tool and was nothing of the sort — a fair summary of
  why one engine was never enough.
- **Two service worker tests no longer depend on offline emulation.** They assert
  against the Cache API directly, which is both portable and a closer statement
  of what they mean: Firefox's offline mode leaves its own HTTP cache answering,
  so the worker's `fetch` succeeds for a page just visited and network-first
  never reaches its fallback. Three tests that genuinely need the network cut are
  skipped on WebKit, where Playwright refuses an offline navigation before the
  worker is consulted at all; the reason is written where the skip is.
- **Confirmation dialogs are answered through a helper that waits for them to
  arrive and to leave.** Clicking the button by its label alone was a race on
  WebKit — a click issued while the dialog was still being promoted into the top
  layer is swallowed — which flaked about two runs in five on the one test that
  opens two dialogs in a row. The dialog code itself was not at fault; a probe
  found it removing its dialog cleanly on every engine.
- **The time export takes the latest session end rather than the last recorded
  one**, so hand-edited or migrated data cannot produce an entry that appears to
  have finished before it did.

## 3.0.0 — full rewrite

Versions 1.0 and 2.0 were standalone HTML files with inline scripts and styles,
two full copies of every tool, and no tests, linting, types or CI. This release
replaces them with one TypeScript codebase. The archived originals are at the
[`v1.0-archive`](../../releases/tag/v1.0-archive) tag.

Existing data is migrated on first load — ratios, time entries, comments, saved
games, best times and preferences — and the old keys are left untouched so a
rollback loses nothing. The old URLs still work: the build emits a redirect at
each of the ten 1.0/2.0 file names.

### Security fixes

- **Removed the CDN dependency.** The Time Tracking tool loaded SheetJS 0.18.5
  from cdnjs with no Subresource Integrity hash and no Content Security Policy.
  That version has published advisories, and the fixed releases are not on npm.
  Replaced with a dependency-free `.xlsx` writer, verified against an independently
  written ZIP reader. The site now ships **zero** third-party runtime code.
- **Added a strict Content Security Policy** with Trusted Types, injected into
  every page at build time and verified by both a unit test and a browser test.
  The build fails if any inline script or style reaches the output.
- **The Sudoku worker is a real bundled file,** not a `Blob` built from inline
  source, so the policy can keep `worker-src 'self'` instead of allowing `blob:`.
- **Fixed `escapeAttribute()`**, which escaped `&` _last_ and so double-encoded its
  own output: a quotation mark in a comment rendered as the literal `&quot;`. The
  new DOM layer removes the class of bug entirely by never turning strings into
  markup.
- **All stored data is now schema-validated on read.** Sudoku loaded a saved game
  with a bare `JSON.parse` and then indexed `initialBoard[row][col]` while
  rendering, so one truncated or hand-edited save produced a `TypeError` and a
  board that never appeared, with no recovery short of clearing site data.
- **Bounded everything unbounded:** comment length, the remembered-comment list,
  saved games, best times, undo history and accepted image size.
- **Spreadsheet exports cannot inject.** Cells are written as inline strings, so a
  comment beginning `=cmd|…` is displayed rather than evaluated. The CSV fallback
  was dropped because CSV cannot mark a field as text.

### Bug fixes

- **A timer left running no longer counts while the tab is closed.** Version 2.0
  stored only the start timestamp and computed elapsed time as `now - start` on
  load, so closing a laptop at 17:00 and reopening it at 09:00 credited the entry
  with sixteen hours. Time is now banked to a heartbeat, and an interrupted
  session is closed at the last moment the page was demonstrably open.
- **Puzzle generation cannot hang.** The generator removed clues in a
  `while (attempts > 0)` loop that only ended once it had removed exactly as many
  as requested; once no further clue could be removed without making the puzzle
  ambiguous — routine at the harder settings — it spun forever, showing a
  "Generating…" message that never cleared. Removal now walks a shuffled list of
  positions once and always terminates.
- **Generation is also ~200× faster,** by tracking candidates as bitmasks and
  branching on the most constrained cell instead of rescanning neighbours.
- **Sudoku highlights only the cells actually in conflict.** Previously one wrong
  digit reddened all nine cells of its row, column or box.
- **The Sugar Calculator handles amounts above its largest food.** Version 1.0
  searched for the first food with _at least_ the given sugar content; above
  99.8 g it found none and silently displayed the _least_ sugary foods instead.
- **Picture Counter markers survive a resize.** Version 1.0 had no resize handling
  at all, so rotating a phone left the image drawn into a corner. Marker
  coordinates are now stored in image space and the view is recomputed around its
  centre.
- **Marker numbering cannot drift.** A separate counter was incremented on add and
  decremented on undo; the number is now derived from position.
- **Taps beside the image are ignored.** A marker placed in the margin was counted
  on screen but absent from the saved PNG.
- **Dates are stored as ISO `YYYY-MM-DD`.** They were stored as `29.07.26`, which
  cannot be sorted, compared, or read in another locale.

### Changes you will notice

- **One version of each tool.** The 1.0/2.0 toggle is gone; the 2.0 behaviour is
  now simply the tool.
- **Full German and English translation** of everything, chosen from your browser
  and overridable in the app bar. Previously the hub and two tools were German,
  two were English, and Sudoku mixed the two.
- **A site-wide light/dark/system theme control.** Only Sudoku had one before, and
  it could not express "light mode on a dark-mode device".
- **Sudoku's radial number picker is kept**, and is still the way digits are
  entered with a pointer: tap a cell and the ring opens on that spot, so the digits
  come to the finger instead of the finger travelling to a keypad. Holding a digit
  rather than tapping it pencils in a note, so notes need no mode switch. Compared
  with 2.0 it now also has a hold indicator, an animated open, a highlight on the
  cell being edited, viewport clamping on all four sides, and dismissal with Escape.
  Rapid entry across cells has no dead time between them: only a tap outside the
  ring briefly suppresses reopening, and choosing a digit does not.
- **Erasing from the centre of the ring no longer reopens it.** The compatibility
  click a browser emits after a touch gesture is hit-tested once the ring is
  already hidden, so it landed back on the originating cell. A cell now opens the
  picker only when the gesture began on it.
- **Keyboard entry remains a separate, complete path** — arrow keys to move, 1–9 to
  enter, Shift+1–9 for a note, 0 or Delete to clear — so the tool is fully usable
  without a pointer.
- **Native dialogs** replace `confirm()`, which brings focus trapping, Escape to
  dismiss, and translated buttons. Destructive actions default to the safe choice.
- **Accessibility work throughout:** keyboard support for the Sudoku grid via
  roving tabindex, a skip link on every page, visible focus rings, live regions for
  status messages, labelled controls, WCAG AA contrast, and honouring
  `prefers-reduced-motion`.
- **A warning when the browser refuses to persist data,** instead of silently
  losing a day's tracked time on tab close.

### Engineering

- TypeScript with every strictness flag enabled, including
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- 382 unit tests (Vitest) and 84 browser tests (Playwright, desktop and mobile),
  with coverage thresholds enforced.
- ESLint with type-aware rules, plus rules that ban the DOM sinks the Content
  Security Policy blocks, so violations are caught while writing rather than in
  production. Prettier for formatting.
- GitHub Actions: format, lint, typecheck, unit tests, build, audit and end-to-end
  tests on every push and pull request; CodeQL `security-extended`; Dependabot for
  packages and workflow actions; automated deployment to Pages.
- Design tokens defined once instead of copied into five files.
- Removed a 1 MB unoptimised PNG that the new design no longer uses.
