/**
 * Content Security Policy, defined once and injected into every page at build time.
 *
 * GitHub Pages cannot set response headers, so the policy travels in a
 * `<meta http-equiv>` tag. Everything below applies exactly as it would from a
 * header, with one exception: a few directives are header-only, and a browser
 * that meets one in a `<meta>` tag ignores it *and logs an error*. Those live in
 * `HEADER_ONLY` and are stripped from the meta output — emitting them would
 * trade a console error on every page load for no protection at all.
 *
 * `contentSecurityPolicyHeader()` returns the complete policy including them, for
 * a deployment that can send headers. Framing protection is the only thing lost
 * on Pages, and no page here holds a session or reads a credential, so there is
 * nothing for a clickjacking attempt to capture.
 *
 * The production policy is deliberately close to the strictest thing a web page
 * can assert: nothing loads unless it came from this origin, and no string can
 * ever become executable markup.
 */

type Directives = Readonly<Record<string, readonly string[]>>;

/**
 * Directives browsers honour only in a real response header. Including them in a
 * `<meta>` policy is a console error, not a policy.
 */
const HEADER_ONLY: readonly string[] = ['frame-ancestors', 'report-uri', 'report-to', 'sandbox'];

const PRODUCTION: Directives = {
  /* Deny-by-default; every capability below is an explicit, justified opt-in. */
  'default-src': ["'none'"],

  /* Only bundled, same-origin modules. No inline scripts, no eval, no CDN. */
  'script-src': ["'self'"],

  /* Only bundled stylesheets. Inline styles and style attributes are refused. */
  'style-src': ["'self'"],

  /* `blob:` is required by the Picture Counter, which renders user-chosen images
     from an object URL and offers the annotated result back as a blob download.
     The image never leaves the browser. */
  'img-src': ["'self'", 'blob:'],

  'font-src': ["'self'"],

  /* No tool talks to a server. Kept at 'self' rather than 'none' so that a
     same-origin fetch of a bundled asset keeps working. */
  'connect-src': ["'self'"],

  /* The Sudoku generator runs in a real module worker shipped as a build
     artifact, not a `blob:` URL built from inline source. That is what lets
     this stay 'self' instead of having to allow `blob:`. */
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],

  /* Nothing may be embedded, and no plugin content exists. */
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'child-src': ["'none'"],
  'frame-ancestors': ["'none'"],

  /* Injected `<base>` tags cannot repoint relative URLs, and there are no forms
     to submit anywhere on the site. */
  'base-uri': ["'none'"],
  'form-action': ["'none'"],

  /* Trusted Types: in supporting browsers this turns every DOM sink that parses
     a string as markup (`innerHTML`, `outerHTML`, `document.write`, …) into a
     hard error. The application builds DOM exclusively through `createElement`
     and `textContent`, so it never touches those sinks — the directive exists to
     make that property enforced rather than merely intended.

     Exactly one policy is permitted, `dwt-worker` (see `src/core/trusted-types.ts`).
     The `Worker` constructor is itself a Trusted Types sink, and the Sudoku
     generator needs a worker; that policy does nothing but bless same-origin
     worker URLs. Naming it here means no other policy can be created, so a
     script that somehow ran could not mint itself a permissive one. */
  'require-trusted-types-for': ["'script'"],
  'trusted-types': ['dwt-worker'],
};

/**
 * Development policy.
 *
 * Vite's dev server injects styles from JavaScript and needs a websocket for
 * hot reload, so `'unsafe-inline'` styles and `ws:` connections are unavoidable
 * here. Everything else is kept identical to production so that a violation
 * shows up while developing rather than after deploying. Trusted Types are left
 * out because the dev client would trip over them; the production build is what
 * the end-to-end CSP test exercises.
 */
const DEVELOPMENT: Directives = {
  ...PRODUCTION,
  'style-src': ["'self'", "'unsafe-inline'"],
  'connect-src': ["'self'", 'ws:', 'wss:'],
  'require-trusted-types-for': [],
  'trusted-types': [],
};

function serialize(directives: Directives, includeHeaderOnly: boolean): string {
  return Object.entries(directives)
    .filter(
      ([name, values]) => values.length > 0 && (includeHeaderOnly || !HEADER_ONLY.includes(name)),
    )
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

/** The policy as delivered in a `<meta http-equiv>` tag. */
export function contentSecurityPolicy(mode: 'production' | 'development'): string {
  return serialize(mode === 'production' ? PRODUCTION : DEVELOPMENT, false);
}

/**
 * The complete policy, for a deployment that can send response headers.
 *
 * Not used by the GitHub Pages build. It exists so that moving this site behind a
 * server or CDN is a matter of copying one string, rather than rediscovering
 * which directives the meta tag had to leave out.
 */
export function contentSecurityPolicyHeader(): string {
  return serialize(PRODUCTION, true);
}
