# Changelog

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
- **Sudoku's radial number menu was replaced by an always-visible number pad.**
  The radial menu was pointer-only and could not be reached by keyboard or screen
  reader. The pad works for everyone, and keyboard entry is unchanged. _This is the
  one deliberate feature removal in this release_ — say the word if you want the
  radial menu rebuilt as an additional touch input.
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
