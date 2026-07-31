# Security

This is a static site with no backend, no authentication and no user data leaving
the device. That makes the threat model small but not empty: the interesting risks
are code injection into the page, a compromised dependency, and mishandling of the
files and text the user hands to the tools.

## Reporting a vulnerability

Please open a [private security advisory](../../security/advisories/new) rather
than a public issue. If you would rather use email, the address on the repository
owner's GitHub profile works.

Include what you did, what happened, and which browser you used. There is no bug
bounty; this is a hobby project maintained in spare time, and a fix will be
prioritised over a release.

## Threat model

**In scope.** Cross-site scripting via any string the site renders or stores;
supply-chain compromise of anything the browser loads; a malicious or corrupt
`localStorage` value crashing or subverting a tool; a chosen file causing memory
exhaustion or being exfiltrated; injection into an exported spreadsheet.

**Out of scope.** Anything requiring an already-compromised device or browser
extension, since either can read the page regardless. Denial of service against
GitHub Pages. Social engineering of the maintainer. The absence of
`frame-ancestors` on GitHub Pages (see below) — there is no session or credential
to capture by framing the site.

## What protects the site

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
  locally chosen image and offer the annotated result back as a download. The image
  is never uploaded.
- **Header-only directives are omitted.** `frame-ancestors`, `report-uri`,
  `report-to` and `sandbox` are ignored when delivered in a `<meta>` tag _and_
  logged as errors. GitHub Pages cannot set headers, so including them would buy a
  console error per page load and no protection. `contentSecurityPolicyHeader()`
  returns the complete policy for a deployment that can send headers.

The build also **fails** if any inline `<script>`, `<style>` or `style` attribute
reaches the output ([`build/plugins.ts`](build/plugins.ts)), since the policy would
silently block it at run time.

### No third-party runtime code

The site has **zero runtime dependencies**. Versions 1.0 and 2.0 loaded SheetJS
from cdnjs:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
```

with no Subresource Integrity hash and no CSP — a script from another origin,
unpinned by content, running with the page's full authority. That version also has
published advisories (prototype pollution; regular-expression denial of service),
and the fixed releases are not on the public npm registry.

It was replaced by [`src/lib/xlsx/`](src/lib/xlsx/): a store-only ZIP writer and a
minimal SpreadsheetML generator, together about 400 lines, at 100% test coverage,
with output verified against an independently written ZIP reader. There is now no
CDN to trust, no integrity hash to maintain, and the export works offline.

### Untrusted input

- **`localStorage` is validated on every read.** Every value passes through a
  [schema](src/core/schema.ts). A value that no longer matches is moved to a
  `!corrupt` key and the default is used, so a malformed save is inspectable rather
  than fatal. Version 2.0 read saves with a bare `JSON.parse` and indexed straight
  into the result — one truncated save meant a `TypeError` on load and a board that
  never appeared.
- **Bounds are enforced at the boundary,** not hoped for. Sudoku boards must be
  exactly 81 cells of 0–9. Comments are capped at 500 characters and the remembered
  list at 200 entries, so voice dictation cannot grow storage without limit. Saved
  games and best times are capped too.
- **Lists decode leniently where partial data beats none.** One unreadable time
  entry costs that entry, not the day's tracking.
- **Storage failures are handled.** Reading `localStorage` throws outright in
  Safari's private mode and with cookies disabled; an in-memory store takes over and
  the user is told their data will not persist. A full quota is reported rather than
  swallowed.

### Files and exports

- **Images stay local.** The Picture Counter reads a chosen file through an object
  URL, capped at 25 MB, with the object URL revoked when replaced or on page hide.
  Version 2.0 used `readAsDataURL`, which additionally held the entire image as a
  base64 string. The type is checked, and a decode failure is reported rather than
  leaving a broken canvas.
- **Spreadsheet cells cannot inject.** Text is written as `t="inlineStr"`, so Excel
  displays it rather than evaluating it — a comment beginning `=cmd|…` is inert.
  XML metacharacters are escaped ampersand-first, and control characters XML cannot
  represent are stripped. The CSV fallback version 2.0 used was dropped precisely
  because CSV has no way to mark a field as text.

### Other headers

`referrer: no-referrer` on every page. There is nothing to leak and nowhere to leak
it to, but it costs nothing to say so.

## Dependency policy

The site ships nothing third-party, so `npm audit --omit=dev` is the audit that
speaks to what users receive, and **CI fails if it is not clean**.

Build-time advisories are reported but do not fail the build. `npm audit` is
currently clean across both production and development dependencies; the
`brace-expansion` advisories that used to reach us transitively through ESLint
and the coverage reporter cleared with the dependency update in `d9fd104`.

The policy behind that split still stands, and it is the reason the development
audit does not gate CI: an advisory against a package that only ever runs on a
maintainer's machine cannot reach a visitor's browser, and forcing an
incompatible major version to silence one is how build systems get broken —
which is exactly what happened the last time it was tried against the coverage
reporter. Each advisory is judged on whether it can reach a visitor, and that
judgement gets revisited whenever the tooling is updated.

Dependabot raises **security** advisories against a dependency immediately and
individually, so they are never delayed or buried. Routine version bumps are a
separate matter: they arrive as one grouped pull request per ecosystem, monthly.
Since no dependency here reaches a visitor's browser, a routine bump is a
maintenance chore rather than a risk, and there is no benefit in it competing for
attention with a real advisory.

CodeQL runs the `security-extended` suite on every push and weekly.
