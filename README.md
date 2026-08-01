# Dimis Webtools

Six small browser tools that run entirely on your own device. No accounts, no
tracking, no servers, and no third-party code at run time.

| Tool                        | What it does                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------- |
| [Sudoku](sudoku/)           | Puzzles with a timer, pencil notes, saved games and best times                        |
| [Rice Cup Converter](rice/) | Cups of rice to cups of water, with presets per rice type                             |
| [Time Tracking](time/)      | Start/pause/stop timers, voice control, export to a spreadsheet                       |
| [Sugar Calculator](sugar/)  | Grams of sugar as cubes, as a share of the WHO daily maximum, and as comparable foods |
| [Picture Counter](counter/) | Mark and count objects in a photo, then save the annotated image                      |

Every tool is available in English and German, follows your system's light or
dark theme, and takes whatever accent colour you pick for it.

Everything works offline. Opening any one tool caches all of them, so the
shopping list is there in a shop with no signal, and a puzzle still generates on
a train. Pages are fetched from the network whenever there is one, so being
offline-capable never means being served a stale version.

## Design principles

These are the rules the codebase is built around. They explain most of the
decisions you will find in it.

**Your data stays yours.** Nothing is uploaded. There is no analytics, no
telemetry and no network request to anywhere but this site's own origin — a
property an [end-to-end test](e2e/security.spec.ts) asserts on every page.
Everything is stored in `localStorage` under a `dwt:` prefix, and you can delete
it at any time by clearing site data.

**Zero runtime dependencies.** The site ships no third-party JavaScript at all.
The one dependency it used to have — SheetJS, loaded from a CDN with no integrity
hash — was replaced with a small, tested [`.xlsx` writer](src/lib/xlsx/). That
removes an entire class of supply-chain risk rather than managing it.

**Untrusted input is validated at the boundary.** `localStorage` survives across
versions, is editable by hand, and is shared with anything else that runs on this
origin. Every read goes through a [schema](src/core/schema.ts); data that no
longer matches is quarantined instead of crashing the page.

**No string ever becomes markup.** All DOM is built through
[`core/dom.ts`](src/core/dom.ts) with `createElement` and `textContent`. There is
no escaping step to get wrong, ESLint forbids the sinks, and the Content Security
Policy enforces it with Trusted Types.

## Getting started

Requires Node 22 or newer (see [`.nvmrc`](.nvmrc)).

```bash
npm install
npm run dev        # dev server with hot reload
```

| Command                 | What it does                                  |
| ----------------------- | --------------------------------------------- |
| `npm run dev`           | Dev server                                    |
| `npm run build`         | Typecheck, then build to `dist/`              |
| `npm run preview`       | Serve the built output, exactly as deployed   |
| `npm test`              | Unit tests                                    |
| `npm run test:watch`    | Unit tests in watch mode                      |
| `npm run test:coverage` | Unit tests with coverage thresholds enforced  |
| `npm run e2e`           | Playwright tests against the production build |
| `npm run lint`          | ESLint                                        |
| `npm run typecheck`     | `tsc` over both projects                      |
| `npm run format`        | Prettier, writing changes                     |
| `npm run verify`        | Everything CI runs, in one command            |

Before opening a pull request, `npm run verify` is the single command that tells
you whether CI will be happy.

## How the code is laid out

```
index.html            the hub
<tool>/index.html     one entry point per tool, giving clean URLs like /sudoku/
src/
  config/site.ts      the tool catalogue — build inputs, hub cards and tests all read this
  config/accent.ts    the accent colours the picker offers
  core/               framework-free primitives: Result, schema, storage, DOM, formatting, colour
  i18n/               en.ts defines the message keys; de.ts must satisfy them to compile
  lib/xlsx/           the dependency-free spreadsheet writer
  shell/              app bar, theme, dialogs, per-page bootstrap
  styles/             design tokens and shared components, in one place
  tools/<tool>/       each tool: domain logic in its own modules, DOM only in main.ts
build/                Vite plugins and the Content Security Policy
e2e/                  Playwright specs
```

Two conventions matter when adding to this:

- **Domain logic is separated from the DOM.** Timer arithmetic, Sudoku solving,
  zoom transforms and spreadsheet assembly are pure functions in their own
  modules with their own tests. `main.ts` files only wire them to elements. That
  split is why the interesting logic has unit tests at all.
- **Adding a tool means one entry in [`src/config/site.ts`](src/config/site.ts)**
  plus a directory. The build inputs, the hub cards, the redirect stubs and the
  test sweep all derive from that list.

## Testing

Two layers, deliberately:

- **Unit tests** (Vitest, jsdom) cover the pure logic — 380-odd tests with
  coverage thresholds enforced in CI.
- **End-to-end tests** (Playwright) drive the real built site in Chromium and a
  mobile viewport. They cover what unit tests structurally cannot: the Content
  Security Policy, the Web Worker, canvas interaction, file downloads and the
  redirects from the old URLs.

The e2e suite runs against `vite preview`, not the dev server, because the strict
policy and the bundled worker only exist in the production build.

## Deployment

Pushing to `main` runs [`deploy.yml`](.github/workflows/deploy.yml), which runs
`npm run verify`, then the end-to-end suite, then builds and publishes to GitHub
Pages. `BASE_PATH` controls the deployment base and defaults to `/<repo>/`; set
it to `/` if you configure a custom domain.

Both workflows call `npm run verify` rather than listing the gates themselves, so
there is one definition of "verified" and it is the one you run locally. The
deploy runs the end-to-end suite as well because that is the only thing covering
[`src/sw.ts`](src/sw.ts) — a service worker cannot be exercised in jsdom, and it
is the most persistent thing the site ships, since it outlives the tab that
installed it.

Because there is now a build step, the source is no longer editable directly in
the GitHub web UI — clone, change, and let CI publish.

## History

This is version 3.0, a full rewrite. Versions 1.0 and 2.0 were standalone HTML
files with inline scripts and styles; they are preserved at the
[`v1.0-archive`](../../releases/tag/v1.0-archive) tag.

The old URLs (`SDK-v2.html`, `rcc-index.html`, and the rest) still work — the
build emits a redirect at each one — and saved data carries over: existing ratios,
time entries, comments, saved games and best times are migrated on first load,
without touching the old keys, so rolling back loses nothing.

`CHANGELOG.md` describes what changed and why, including the bugs the rewrite
fixed. Security posture is documented in [`SECURITY.md`](SECURITY.md), and
[`CONTRIBUTING.md`](CONTRIBUTING.md) covers the conventions in more detail.

## Licence

[MIT](LICENSE).
