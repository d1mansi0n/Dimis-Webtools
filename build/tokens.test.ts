/*
 * @vitest-environment node
 *
 * The suite runs in jsdom by default, where `import.meta.url` is an `http:` URL
 * and nothing can be read from disk.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCENT } from '../src/config/accent.js';
import { derivePalette, THEME_SURFACE, type ThemeMode } from '../src/core/color.js';

/**
 * The accent tokens are declared twice: once in `tokens.css`, which paints the
 * first frame before any module has run, and once by `shell/accent.ts`, which
 * paints every frame after it. A visitor who never changed the accent must not
 * see the colour jump on load — that is the same flash the theme code goes out
 * of its way to avoid — so the two have to agree, and this is what says so.
 *
 * The stylesheet is read from disk rather than imported: Vitest stubs CSS
 * imports out by default, and `?raw` goes through the same stub, so an import
 * would silently assert against an empty string.
 */
const tokensCss = readFileSync(
  fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)),
  'utf8',
);

/**
 * Read the custom properties out of one rule.
 *
 * A real CSS parser would be a dependency; the stylesheet is a fixed,
 * hand-written file whose declarations are all plain `--name: value;`.
 */
function tokensOf(selector: string): Map<string, string> {
  const start = tokensCss.indexOf(`${selector} {`);
  expect(start, `tokens.css should contain "${selector}"`).toBeGreaterThanOrEqual(0);
  const block = tokensCss.slice(start, tokensCss.indexOf('}', start));

  const declarations = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (name !== undefined && value !== undefined) declarations.set(name, value.trim());
  }
  return declarations;
}

const THEME_SELECTOR: Readonly<Record<ThemeMode, string>> = {
  light: ':root',
  dark: ":root[data-theme='dark']",
};

describe('the accent tokens in tokens.css', () => {
  for (const theme of ['light', 'dark'] as ThemeMode[]) {
    it(`declare what the default accent derives to for the ${theme} theme`, () => {
      const declared = tokensOf(THEME_SELECTOR[theme]);
      const derived = derivePalette(DEFAULT_ACCENT, theme);

      expect(declared.get('--accent')).toBe(derived.accent);
      expect(declared.get('--accent-hover')).toBe(derived.accentHover);
      expect(declared.get('--accent-soft')).toBe(derived.accentSoft);
      expect(declared.get('--accent-glow')).toBe(derived.accentGlow);
      expect(declared.get('--control')).toBe(derived.control);
      expect(declared.get('--text-on-accent')).toBe(derived.textOnAccent);
    });

    it(`are derived against the ${theme} theme's real surface colour`, () => {
      /* The contrast searches aim the accent at a surface named in `color.ts`.
         If the stylesheet's surface moves and that constant does not, every
         derived accent is quietly aimed at the wrong background. */
      expect(tokensOf(THEME_SELECTOR[theme]).get('--surface')).toBe(THEME_SURFACE[theme]);
    });
  }

  it('say the same thing in the explicit dark rule and the system dark rule', () => {
    /* The two dark blocks are duplicated by hand, which is precisely why this is
       worth asserting: every token now has to be edited in both. */
    const explicit = tokensOf(THEME_SELECTOR.dark);
    const bySystem = tokensOf(":root:not([data-theme='light'])");

    expect(explicit.size).toBeGreaterThan(0);
    for (const [name, value] of explicit) {
      expect(bySystem.get(name), name).toBe(value);
    }
  });
});
