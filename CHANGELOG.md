# Changelog

## Unreleased

### Sudoku celebrates again

The 1.0 tool rained confetti across the screen and turned its heading gold for
five seconds when the last digit went in. The rewrite replaced all of it with a
green glow around the board, which _states_ that the puzzle is solved without
ever celebrating it, and no changelog entry ever admitted to the loss. Finishing
a Sudoku is the one moment on this site that has earned a flourish.

- **Confetti and a gold, pulsing headline** on a solve, running until the player
  starts another puzzle, resets or loads a game. Even 1.0 put the moment on a
  five-second timer, which takes it away while the board that earned it is still
  on screen. It starts after the best-time question is answered, because a modal
  `<dialog>` renders in the top layer and anything thrown while it is open falls
  behind its backdrop — which is what 1.0 waited for too.
- **The rain recycles rather than running out.** A piece that falls off the
  bottom climbs back to the top and falls again, so an endless shower is 280
  looping CSS animations and no timer, allocation or garbage after the first
  frame. The population comes from 1.0's own density — ten pieces every 200ms,
  each falling for four seconds, is about two hundred in the air at once.
- **The gold is legible this time.** `#FFD700` on a white page sits at 1.6:1, so
  the light theme uses a deep gold at 4.6:1 and the dark theme keeps the
  original.
- **No `style` attribute anywhere in it.** Each piece gets its column, drift,
  spin, delay and speed as custom properties and its colour from the stylesheet
  by `data-tone`, so the Content Security Policy has nothing to refuse. 1.0 span
  up its nodes from a `setInterval` and wrote colours from script.
- **Under `prefers-reduced-motion` the confetti is not built at all.** The site
  collapses every animation to nothing under that preference, which would have
  left hundreds of motionless rectangles across the top of the screen until the
  next puzzle. The heading still turns gold; colour is not motion.

### A new Sudoku board starts clean

Nothing is selected until the player selects something. The tool used to select
the first empty cell in reading order for them, which put a tinted cell, a
tinted row, a tinted column and a tinted box on screen before anyone had
touched the board, and pointed at a cell chosen by position rather than by
playability. The grid is still reachable from the keyboard — one cell remains
the tab stop, and the first arrow key takes the selection.

### About 2,500 lines were removed

None of it changed what the site can do, beyond one narrowed setting. Each was a
case of the code being more interesting than the feature it delivered.

- **The accent picker offers six colours instead of any colour.** Behind it was a
  350-line colour library: every preset was a _seed_, converted to OKLCH, chroma
  clamped, then lightness binary-searched against the theme's surface until it
  met 4.5:1 — at run time, on every page load, so that the operating system's
  colour dialog could be offered too. The six were derived once, checked and
  written out. The custom-colour field went with the library. The contrast
  guarantee did not: `build/accent.test.ts` re-checks all twelve palettes against
  the WCAG formula in twenty lines, so a hand-edited colour that fails still
  fails the build.
- **The spreadsheet export is a CSV.** Writing a real `.xlsx` meant a hand-rolled
  ZIP container with its own CRC-32 table and central directory, plus a workbook
  writer for the XML inside — about 800 lines with tests, so that one column
  could carry a number format. German exports use comma decimals and semicolon
  separators, which is the convention Excel itself uses for those locales, and
  the file leads with a byte-order mark so Excel stops mangling umlauts.
- **The 1.0/2.0 redirect stubs are gone.** Ten pages redirecting `SDK-v2.html`
  and friends, for URLs nothing links to.
- **`schema.ts` lost `optional`.** It accepted a missing field but rejected an
  explicit `null`, and since JSON has no `undefined`, reaching for it instead of
  `nullish` silently discarded every migrated record that had ever been paused.
  With one function there is no wrong one to reach for. `time/model.ts` also
  stopped hand-rolling a boolean decoder three times over.
- **`CONTRIBUTING.md` and `SECURITY.md` folded into the README.** One file to
  keep current instead of three that had begun to disagree.

Every page got smaller: the hub by 1.5 kB gzipped, Time Tracking by 3.3 kB. The
budgets in `PAGE_BUDGETS` were re-cut to match, because a budget with a fifth of
the page spare is not a budget.

### The interface picked its colour back up

Following the redesign below, which had been too austere.

- **The accent is back on the numbers a tool computes** — the cups of water, the
  total elapsed, the Sudoku clock, the scaled ingredient amounts. Reserving the
  site's one colour for buttons and focus rings left the pages looking drained
  and the answers looking incidental.
- **Working areas have a frame again.** A faint fill and a hairline on the panels
  that are a tool's actual surface. Rules alone left each page reading as one
  undifferentiated sheet.
- **Tapping anywhere on a recipe opens it.** The name now lives inside the
  `<summary>`, so the whole row is the disclosure control; previously the only
  thing that opened a recipe was the word "Method".

### The interface was redesigned

The palette and the contrast work behind it were already sound. What the pages
_did_ with them was not: every section of every tool was a bordered, shadowed
white card on a grey page, so each screen read as a column of identical slabs
with nothing saying which of them mattered.

- **Sections are separated by a rule, not by a card.** Cards are now rare — a
  dialog, the Picture Counter's stage — and lists are rows on hairlines. The hub
  went from six white slabs to a two-column index; Recipes lost twenty-five of
  them and about a quarter of its height.
- **There is a type scale.** Six sizes with stated weights and tracking, and
  nothing may invent a seventh. The pages previously used nine sizes between
  0.72 and 0.95rem, no two far enough apart to read as different.
- **Actions are grouped and ranked.** Sudoku's ten buttons were one wrapping row
  in markup order, so "Reset" arrived at the same weight as "Check"; they are now
  the four a player reaches for, then the five that manage the game. The Picture
  Counter's eleven controls are in the three groups they fall into. A destructive
  action is neutral at rest and red only under the pointer, instead of drawing
  the most urgent outline on the page next to the button you came to press.
- **The accent means something again.** It marks the primary action, the current
  selection and focus — not a total of zero, not a clock reading 00:01, not six
  decorative tiles. On the Sudoku board it now distinguishes a digit you entered
  from a given, which let the board drop the scattered grey fills and the black
  gridlines for a clean grey grid.
- **The recipes no longer carry emoji.** Emoji are a font the site does not
  control, which is why `shell/icons.ts` exists; twenty-five of them down one
  page was the single loudest thing on the site.
- **The app bar spans the page and stays put.** It names the site, is the way
  back to the hub, and gathers the three settings into one group — the accent
  control used to read as an unexplained coloured dot floating above the page.
- Fixed: the Sugar Calculator's comparison list stayed on screen after the field
  was cleared. `.stack` sets `display`, which beats the user agent's `[hidden]`
  rule, so hiding it did nothing. `components.css` now states this once for every
  layout class it defines rather than leaving it to be rediscovered a third time.

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
- **Confirmation dialogs are answered through one helper**, which waits for the
  dialog to arrive, forces the click, and then asserts it left. Two separate
  WebKit problems sat behind this: a click issued while the dialog was still
  being promoted into the top layer is swallowed, and Playwright's own
  actionability check waits for two consecutive animation frames with an
  identical box — which two parallel WebKit contexts starve each other of, so it
  can hang on an element measured to be perfectly still. Forcing is safe because
  the assertion after it fails if the click did not land. The application's
  dialog code was not at fault, which was checked rather than assumed.
- **The time export takes the latest session end rather than the last recorded
  one**, so hand-edited or migrated data cannot produce an entry that appears to
  have finished before it did.
- **The deploy checks the site it just published.** A service worker answered
  with a non-JavaScript `Content-Type` is rejected by the browser outright and
  offline support silently never starts — a property of the host, not the
  artifact, so nothing in the build or the test suite can see it. The workflow
  now fetches the deployed `sw.js`, checks how it is served and that its precache
  manifest was injected, and fails the run otherwise. This replaces a manual
  "open DevTools and look" step, which is not a check at all.
- **The page budgets have real headroom.** They were set within a percent or two
  of each page's true weight, which sounds stricter and was worse: an ordinary
  CSS tweak tripped the build and the fix was always to raise the number, so the
  failure carried no information. They sit about a tenth above the real figure
  now — wide enough that normal work never touches them, narrow enough to catch a
  dependency or an unoptimised asset immediately.
- **`HANDOFF.md` is gone.** It duplicated `CONTRIBUTING.md` and `CLAUDE.md`, and
  the rest of it — test counts, "what changed last session", a list of things to
  look out for — was stale within a day of being written, three times over. What
  was durable moved into the two files people actually read; the history lives in
  git and this changelog.
- **Dead code removed:** an unused `findTool()` and the unused voice-language
  type, and six exports that nothing outside their own module used are no longer
  exported. The bundler was already dropping them; the point is that the public
  surface of a module should say what it is for.

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
