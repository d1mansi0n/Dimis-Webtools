# Contributing

## Getting set up

```bash
npm install
npm run dev
```

Node 22 or newer ([`.nvmrc`](.nvmrc)). Before pushing:

```bash
npm run verify   # format, lint, typecheck, unit tests, build
npm run e2e      # Playwright, against the production build
```

`npm run verify` runs the same gates as CI, including the coverage thresholds, so
if it passes locally CI will pass too. The e2e suite is separate because it builds
the site and downloads a browser.

That promise is only worth making if it is true: `verify` once ran the tests
without coverage while CI ran them with it, and a change that dropped branch
coverage below the threshold went out green locally and failed on CI. The two run
the same command now.

## Conventions

### Keep domain logic out of the DOM

Each tool has its logic in its own modules and its DOM wiring in `main.ts`:

```
src/tools/time/
  model.ts    entries, timer arithmetic, persistence rules   ← unit tested
  export.ts   spreadsheet row assembly                       ← unit tested
  voice.ts    command parsing                                 ← unit tested
  main.ts     elements and event listeners                    ← covered by e2e
```

This is the convention that makes the codebase testable. If you find yourself
wanting to test something in a `main.ts`, that is a sign the logic belongs in a
sibling module.

### Build DOM with `core/dom.ts`

```ts
import { el } from '../../core/dom.js';

el('p', { class: 'note', text: userSuppliedText });
```

Never assign `innerHTML`, `outerHTML` or `insertAdjacentHTML`. ESLint rejects
them, and the Content Security Policy blocks them at run time via Trusted Types.
There is no escaping helper to reach for because `textContent` makes one
unnecessary — and an escaping helper is exactly what version 1.0 got wrong.

### Validate anything persisted

Every `localStorage` read goes through a schema:

```ts
const store = defineStore({
  key: 'mytool.settings',
  decoder: objectOf({ size: inRange(integer, 1, 100) }),
  fallback: () => ({ size: 10 }),
});
```

Bound anything unbounded — string lengths, list sizes, numeric ranges. The value
you are decoding may have been written by an older version of the code or edited
by hand.

If you change a stored shape, add a `legacy` entry so existing data migrates, and
leave the old key in place so a rollback loses nothing.

### Add strings to `en.ts` first

[`src/i18n/en.ts`](src/i18n/en.ts) defines the key type. Adding a key there makes
`de.ts` fail to compile until it is translated — that is the mechanism, not an
oversight. Use `{placeholders}` for interpolation and `.one`/`.other` for plurals.
Never hardcode a user-visible string in markup or a module.

### Store data in a locale-independent form

Dates are stored as ISO `YYYY-MM-DD` and formatted with `Intl` at render time.
Version 1.0 stored `29.07.26`, which cannot be sorted, compared, or read in
another locale.

### Reuse the cached `Intl` formatters

Use `formatNumber`, `formatIsoDate` and `formatTimestamp` from
[`core/format.ts`](src/core/format.ts), and `plural()` from
[`i18n`](src/i18n/index.ts). Constructing an `Intl` formatter costs tens of
microseconds against well under one for reusing it, which is invisible until it
happens inside a render loop — where it cost the Recipes list several
milliseconds on every tap. ESLint rejects `new Intl.*` outside those two
modules; if you need a formatter that does not exist yet, add a cached one
there.

### Render only what is on screen

Tools with more than one panel should rebuild the visible one and mark the rest
stale, as [`recipes/main.ts`](src/tools/recipes/main.ts) does. Rebuilding a
hidden panel is work nobody can see, and rebuilding a whole list to change one
label is the same mistake in a smaller size.

### Accessibility

Two different mechanisms cover this, and it is worth knowing which does what.

Colour is handled in code: [`core/color.ts`](src/core/color.ts) derives every
accent against the WCAG 2.1 contrast figures, so an accent that would be
illegible cannot be produced in the first place.

Everything else is checked by [`e2e/accessibility.spec.ts`](e2e/accessibility.spec.ts),
which runs axe over every page in `PAGES`. Automated rules catch roughly half of
what matters — an unlabelled control, a missing landmark, an invalid ARIA
structure. They cannot judge whether a label reads well or whether focus order
matches reading order, so a green run is a floor rather than a certificate.

If you use ARIA roles, use the whole pattern: `role="grid"` may contain only
rows, and `role="gridcell"` may sit nowhere but inside one. The Sudoku board got
this wrong for a while — 81 cells parented straight to the grid — and the sweep
is what found it.

### Offline support comes for free

[`src/sw.ts`](src/sw.ts) precaches every page and asset the build emits, and the
list is generated from the real output — so a new tool works offline without
anyone doing anything, in the same way it inherits the security sweep.

The worker is registered only in a production build. In development it would
serve yesterday's modules over the top of hot reload, which is a memorable way to
lose an afternoon. That also means offline behaviour is only observable through
`npm run e2e`, which runs against the production build; see
[`e2e/offline.spec.ts`](e2e/offline.spec.ts), which cuts the network for real
rather than trusting that registration implies it works.

### Adding a tool

1. Add one entry to [`src/config/site.ts`](src/config/site.ts).
2. Create `<tool>/index.html` and `src/tools/<tool>/`.
3. Add the two name/description keys to `en.ts` and `de.ts`.
4. Add a page budget to `PAGE_BUDGETS` in [`build/plugins.ts`](build/plugins.ts).

The build inputs, hub cards and the whole security sweep — Content Security
Policy, no inline code, no third-party requests, `no-referrer`, legacy redirects
— all derive from step 1, so a new tool is enrolled in them automatically.

Step 4 has no default on purpose: the build fails for an entry with no budget,
because deciding what a page may weigh is part of adding one. Run
`npm run build` and it will print each page's real gzipped weight.

## Tests

Unit tests sit beside what they test (`model.ts` → `model.test.ts`). Coverage
thresholds are enforced in CI; the exclusions in
[`vite.config.ts`](vite.config.ts) are for code that is structurally untestable in
jsdom — workers, canvas, Trusted Types — and covered end to end instead.

Write test names as statements about behaviour, and when you fix a bug, say so in
the test:

```ts
it('closes a timer left running when the tab was closed, at the last heartbeat', () => {
  /* The regression test for version 2.0's overnight bug: it stored only the
     start time and computed `now - start` on load, so a laptop closed at 17:00
     and reopened at 09:00 credited the entry with sixteen hours. */
});
```

A test that documents why it exists survives refactoring; one named `test 3` does
not.

## Comments

Comment the _why_, not the _what_. `// increment i` earns nothing. Worth writing
down: a non-obvious constraint, a rejected alternative, a browser quirk, or a bug
this shape of code prevents. Several such comments in this codebase point at
specific defects in the previous version — that is the standard to aim for.

## Pull requests

Keep them focused, explain the reasoning rather than restating the diff, and make
sure `npm run verify` passes. Behaviour changes should come with a test that would
have failed before.
