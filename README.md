# Dimis Webtools

Six small browser tools that run entirely on your own device. No accounts, no
tracking, no servers, and no third-party code at run time.

| Tool                        | What it does                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------- |
| [Sudoku](sudoku/)           | Puzzles with a timer, pencil notes, saved games and best times                        |
| [Rice Cup Converter](rice/) | Cups of rice to cups of water, with presets per rice type                             |
| [Time Tracking](time/)      | Start/pause/stop timers, comments per entry, export to CSV                            |
| [Sugar Calculator](sugar/)  | Grams of sugar as cubes, as a share of the WHO daily maximum, and as comparable foods |
| [Picture Counter](counter/) | Mark and count objects in a photo, then save the annotated image                      |
| [Recipes](recipes/)         | Pick what to cook; the shopping list adds it up by aisle and scales with the people   |

Every tool is available in English and German, follows your system's light or
dark theme, and takes whichever of six accent colours you pick.

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
hash — went when the spreadsheet export became a CSV file. That removes an entire
class of supply-chain risk rather than managing it.
[`build/dependencies.test.ts`](build/dependencies.test.ts) fails on any runtime
dependency field, so this is a test rather than a preference.

**Untrusted input is validated at the boundary.** `localStorage` survives across
versions, is editable by hand, and is shared with anything else that runs on this
origin. Every read goes through a [schema](src/core/schema.ts); data that no
longer matches is quarantined instead of crashing the page.

**No string ever becomes markup.** All DOM is built through
[`core/dom.ts`](src/core/dom.ts) with `createElement` and `textContent`. There is
no escaping step to get wrong, ESLint forbids the sinks, and the Content Security
Policy enforces it with Trusted Types.

**As little code as will do the job.** Features are held to what they cost. The
accent picker offered any colour the operating system could produce, backed by
350 lines of OKLCH conversion and contrast search; it now offers six palettes
written out in a table, checked once by a twenty-line test. The `.xlsx` writer
was 800 lines so a column could carry a number format; CSV does the job. Both
went because the code was more interesting than the feature.

## Getting started

Requires Node 22 or newer (see [`.nvmrc`](.nvmrc)).

```bash
npm install
npm run dev        # dev server with hot reload
```

| Command                 | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `npm run dev`           | Dev server                                              |
| `npm run build`         | Typecheck, then build to `dist/`                        |
| `npm run preview`       | Serve the built output, exactly as deployed             |
| `npm test`              | Unit tests                                              |
| `npm run test:coverage` | Unit tests with coverage thresholds enforced            |
| `npm run e2e`           | Playwright on Chromium + mobile, against the built site |
| `npm run e2e:all`       | The same, on all four projects — what CI runs           |
| `npm run lint`          | ESLint                                                  |
| `npm run typecheck`     | `tsc` over both projects                                |
| `npm run format`        | Prettier, writing changes                               |
| `npm run verify`        | Everything CI runs, in one command                      |

`npm run verify` is the single command that tells you whether CI will be happy.

## How the code is laid out

```
index.html            the hub
<tool>/index.html     one entry point per tool, giving clean URLs like /sudoku/
src/
  config/site.ts      the tool catalogue — build inputs, hub cards and tests all read this
  config/accent.ts    the six accent palettes, written out per theme
  core/               framework-free primitives: Result, schema, storage, DOM, formatting
  i18n/               en.ts defines the message keys; de.ts must satisfy them to compile
  shell/              app bar, theme, accent, dialogs, per-page bootstrap
  styles/             design tokens and shared components, in one place
  tools/<tool>/       each tool: domain logic in its own modules, DOM only in main.ts
build/                Vite plugins and the Content Security Policy
e2e/                  Playwright specs
```

## Conventions

The full list of the ones that are _enforced_ — by ESLint, by the build, or by a
test — is in [`CLAUDE.md`](CLAUDE.md), which is worth reading before changing
anything. The ones that shape the structure:

**Domain logic is separated from the DOM.** Timer arithmetic, Sudoku solving,
zoom transforms and CSV assembly are pure functions in their own modules with
their own tests. `main.ts` files only wire them to elements. That split is why
the interesting logic has unit tests at all.

**Adding a tool means one entry in [`src/config/site.ts`](src/config/site.ts)**
plus a directory. The build inputs, the hub cards, the accessibility sweep and
the security sweep all derive from that list.

**Strings go in `en.ts` first.** `de.ts` is typed against it, so a missing
translation is a compile error rather than an English word on a German page.

**Persisted data is locale-independent.** Dates are stored as ISO strings and
numbers as numbers; formatting happens at render time through the cached `Intl`
formatters in [`core/format.ts`](src/core/format.ts). Version 2.0 stored
`DD.MM.YY` strings, which is why there is migration code.

**Comment the why.** Several comments in this codebase point at a specific defect
in the previous version; that is the standard. What the code does is readable
from the code.

## Testing

Two layers, deliberately:

- **Unit tests** (Vitest, jsdom) cover the pure logic — 480 tests, with coverage
  thresholds enforced in CI.
- **End-to-end tests** (Playwright) drive the real built site. They cover what
  unit tests structurally cannot: the Content Security Policy, the Web Worker,
  canvas interaction, file downloads, and an axe sweep of every page.
  `npm run e2e` uses Chromium and a mobile viewport; CI and the deploy add
  Firefox and WebKit.

The e2e suite runs against `vite preview`, not the dev server, because the strict
policy and the bundled worker only exist in the production build.

## Security

No backend, no authentication and no user data leaving the device, so the threat
model is small but not empty.

**Reporting.** Please open a
[private security advisory](../../security/advisories/new) rather than a public
issue; the email on the repository owner's GitHub profile also works. Include
what you did, what happened, and which browser. There is no bug bounty — this is
a hobby project, and a fix will be prioritised over a release.

**In scope.** Cross-site scripting via any string the site renders or stores;
supply-chain compromise of anything the browser loads; a malicious or corrupt
`localStorage` value crashing or subverting a tool; a chosen file causing memory
exhaustion or being exfiltrated; injection into an exported file.

**Out of scope.** Anything requiring an already-compromised device or browser
extension, since either can read the page regardless. Denial of service against
GitHub Pages. Social engineering of the maintainer. The absence of
`frame-ancestors` on GitHub Pages — there is no session or credential to capture
by framing the site.

### Content Security Policy

Defined once in [`build/csp.ts`](build/csp.ts) and injected into every page at
build time, so it cannot drift between pages. Verified twice: a
[unit test](build/csp.test.ts) checks the policy text, and an
[end-to-end test](e2e/security.spec.ts) loads every page in a real browser and
fails on any violation.

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:;
font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self';
object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none';
form-action 'none'; require-trusted-types-for 'script'; trusted-types dwt-worker
```

Notable choices:

- **`require-trusted-types-for 'script'`** turns every DOM sink that parses a
  string as markup into a hard error in supporting browsers. The application never
  uses those sinks, so this makes a design property enforceable instead of merely
  intended. ESLint bans them at author time as a second layer.
- **`trusted-types dwt-worker`** permits exactly one policy, which does nothing
  but bless same-origin worker URLs — the `Worker` constructor is itself a Trusted
  Types sink. Naming the single allowed policy means injected script could not mint
  itself a permissive one. See [`src/core/trusted-types.ts`](src/core/trusted-types.ts).
- **`worker-src 'self'`, not `blob:`.** Version 2.0 built its Sudoku worker by
  reading an inline `<script>` and wrapping it in a `Blob`, which would have
  required allowing `blob:` workers — a well-known way to get code past a policy.
  The worker is now an ordinary bundled file.
- **`img-src` includes `blob:`** solely so the Picture Counter can display a
  locally chosen image and offer the annotated result back as a download. The
  image is never uploaded.
- **Header-only directives are omitted.** `frame-ancestors`, `report-uri`,
  `report-to` and `sandbox` are ignored when delivered in a `<meta>` tag _and_
  logged as errors. GitHub Pages cannot set headers, so including them would buy a
  console error per page load and no protection. `contentSecurityPolicyHeader()`
  returns the complete policy for a deployment that can send headers.

The build also **fails** if any inline `<script>`, `<style>` or `style` attribute
reaches the output ([`build/plugins.ts`](build/plugins.ts)), since the policy
would silently block it at run time.

### Dependency policy

The site ships nothing third-party, so `npm audit --omit=dev` is the audit that
speaks to what users receive, and **CI fails if it is not clean**.

Build-time advisories are reported but do not fail the build. An advisory against
a package that only ever runs on a maintainer's machine cannot reach a visitor's
browser, and forcing an incompatible major version to silence one is how build
systems get broken — which is what happened the last time it was tried against
the coverage reporter. Each advisory is judged on whether it can reach a visitor.

Dependabot raises **security** advisories immediately and individually, so they
are never delayed or buried. Routine version bumps arrive as one grouped pull
request per ecosystem, monthly. CodeQL runs the `security-extended` suite on
every push and weekly.

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

Because there is a build step, the source is not editable in the GitHub web UI —
clone, change, and let CI publish.

## History

This is version 3.0, a full rewrite. Versions 1.0 and 2.0 were standalone HTML
files with inline scripts and styles; they are preserved at the
[`v1.0-archive`](../../releases/tag/v1.0-archive) tag.

Saved data carries over: existing ratios, time entries, comments, saved games and
best times are migrated on first load, without touching the old keys, so rolling
back loses nothing. The redirect stubs that used to serve the 1.0 and 2.0 file
names (`SDK-v2.html` and the rest) were removed in the same pass that cut the
colour library — nothing linked to them.

[`CHANGELOG.md`](CHANGELOG.md) describes what changed and why, including the bugs
the rewrite fixed.

## Licence

[MIT](LICENSE).
