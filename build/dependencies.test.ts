/*
 * @vitest-environment node
 *
 * The suite runs in jsdom by default, where `import.meta.url` is an `http:` URL
 * and nothing can be read from disk.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The site ships no third-party runtime code, and that is a security property
 * rather than a coincidence.
 *
 * Versions 1.0 and 2.0 pulled SheetJS from cdnjs on every page load, unpinned by
 * any integrity hash and with no Content Security Policy to constrain it — a
 * script from someone else's origin running with the page's full authority. The
 * rewrite replaced it with about 400 lines in `src/lib/xlsx/`, and the resulting
 * "nothing third-party reaches a visitor" claim is what `SECURITY.md` is built
 * on, what makes `script-src 'self'` sufficient, and what makes the production
 * `npm audit` meaningful.
 *
 * Until this test existed, that claim was enforced by memory alone: `npm audit
 * --omit=dev` only reports dependencies with *known advisories*, so adding a
 * clean-but-third-party package to `dependencies` would have passed CI silently.
 * A dependency may still be added — but it takes deleting a line here, which is
 * a decision rather than an accident.
 */

const packageJson: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
);

/** Fields npm installs into the shipped tree, as opposed to the toolchain. */
const RUNTIME_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundleDependencies',
  'bundledDependencies',
] as const;

describe('the shipped dependency tree', () => {
  for (const field of RUNTIME_FIELDS) {
    it(`declares no "${field}"`, () => {
      const value = (packageJson as Record<string, unknown>)[field];
      const names =
        value === undefined || value === null
          ? []
          : Array.isArray(value)
            ? value
            : Object.keys(value);

      expect(
        names,
        `"${field}" must stay empty: everything listed there reaches a visitor's browser. ` +
          `See the "No third-party runtime code" section of SECURITY.md before changing this.`,
      ).toEqual([]);
    });
  }

  it('keeps the toolchain in devDependencies, where it cannot reach a visitor', () => {
    const dev = (packageJson as Record<string, unknown>)['devDependencies'];
    /* Not an assertion about the count — only that the build tooling is declared
       somewhere, so an empty `dependencies` reflects a deliberate split rather
       than a package.json that lost its dependency block altogether. */
    expect(Object.keys((dev ?? {}) as Record<string, unknown>).length).toBeGreaterThan(0);
  });
});
