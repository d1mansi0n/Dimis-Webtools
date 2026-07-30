/**
 * The one Trusted Types policy this site defines.
 *
 * The Content Security Policy sets `require-trusted-types-for 'script'`, which
 * makes every DOM sink that turns a string into code or markup throw unless the
 * value came from a Trusted Types policy. Application code never touches those
 * sinks — everything is built with `createElement` and `textContent` — with one
 * unavoidable exception: the `Worker` constructor is itself a Trusted Types sink,
 * and the Sudoku generator needs a worker.
 *
 * Rather than drop the directive for the whole site, this exposes a single named
 * policy whose only job is to bless same-origin worker URLs. The policy name is
 * the only one the CSP allows, so no other script could create a permissive one
 * even if it managed to run.
 */

/** Minimal shape of the Trusted Types API; it is not in the standard DOM lib. */
interface TrustedScriptURL {
  toString(): string;
}

interface TrustedTypePolicy {
  createScriptURL(input: string): TrustedScriptURL;
}

interface TrustedTypePolicyFactory {
  createPolicy(
    name: string,
    rules: { createScriptURL: (input: string) => string },
  ): TrustedTypePolicy;
}

/** Must match the `trusted-types` directive in `build/csp.ts`. */
const POLICY_NAME = 'dwt-worker';

let policy: TrustedTypePolicy | undefined;
let attempted = false;

function factory(): TrustedTypePolicyFactory | undefined {
  return (globalThis as { trustedTypes?: TrustedTypePolicyFactory }).trustedTypes;
}

function workerPolicy(): TrustedTypePolicy | undefined {
  if (attempted) return policy;
  attempted = true;

  const trustedTypes = factory();
  if (trustedTypes === undefined) return undefined;

  policy = trustedTypes.createPolicy(POLICY_NAME, {
    createScriptURL: (input: string): string => {
      /* The only URLs this policy will ever bless are on our own origin. A
         cross-origin or `blob:`/`data:` URL is refused outright, so the policy
         cannot be turned into a way to load arbitrary code. */
      const resolved = new URL(input, window.location.href);
      if (resolved.origin !== window.location.origin) {
        throw new TypeError(`Refusing to load a worker from ${resolved.origin}.`);
      }
      return resolved.href;
    },
  });
  return policy;
}

/**
 * Convert a worker URL into something the `Worker` constructor will accept under
 * Trusted Types, falling back to the plain string where the API is absent.
 */
export function trustedWorkerUrl(url: URL): string {
  const created = workerPolicy()?.createScriptURL(url.href);
  /* `TrustedScriptURL` is accepted by the Worker constructor at run time; the
     DOM typings only know about strings, so it is passed through as one. */
  return (created ?? url.href) as unknown as string;
}
