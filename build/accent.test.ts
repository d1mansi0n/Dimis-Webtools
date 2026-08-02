/*
 * @vitest-environment node
 *
 * The suite runs in jsdom by default, where `import.meta.url` is an `http:` URL
 * and nothing can be read from disk.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_ID,
  presetById,
  type AccentPalette,
} from '../src/config/accent.js';

/**
 * The accent palettes are written out by hand in `config/accent.ts`.
 *
 * They used to be computed at run time by a 350-line colour library whose whole
 * purpose was guaranteeing they met WCAG AA. The library is gone; the guarantee
 * is not. These twenty lines re-derive the contrast of every value in the table
 * from the WCAG 2.1 formula, so a colour edited by hand into something illegible
 * fails the build exactly as it would have before.
 */
const WEIGHTS = [0.2126, 0.7152, 0.0722];

function luminance(hex: string): number {
  return [1, 3, 5]
    .map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * (WEIGHTS[index] ?? 0), 0);
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The surface each theme's accent has to stay legible on. Mirrors `tokens.css`. */
const SURFACE = { light: '#ffffff', dark: '#1c1c1c' } as const;

/** The contrast ratio WCAG 2.1 asks of body text. */
const AA_TEXT = 4.5;

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

describe('every accent preset', () => {
  for (const preset of ACCENT_PRESETS) {
    for (const theme of ['light', 'dark'] as const) {
      it(`is legible in the ${theme} theme: ${preset.id}`, () => {
        const palette: AccentPalette = preset[theme];

        /* The accent is drawn as text on the page, and again as text on its own
           soft tint — a badge is accent-coloured text on an accent-soft pill —
           so it has to clear the bar on both. */
        expect(contrast(palette.accent, SURFACE[theme])).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrast(palette.accent, palette.soft)).toBeGreaterThanOrEqual(AA_TEXT);

        /* And the label drawn on top of a filled primary button. */
        expect(contrast(palette.on, palette.accent)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('uses a distinct id and a distinct colour for each', () => {
    expect(new Set(ACCENT_PRESETS.map((p) => p.id)).size).toBe(ACCENT_PRESETS.length);
    expect(new Set(ACCENT_PRESETS.map((p) => p.light.accent)).size).toBe(ACCENT_PRESETS.length);
  });

  it('is written as a lowercase six-digit hex, which the contrast check assumes', () => {
    for (const preset of ACCENT_PRESETS) {
      for (const theme of ['light', 'dark'] as const) {
        for (const value of Object.values(preset[theme])) {
          expect(value, `${preset.id} ${theme}`).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });
});

describe('the accent tokens in tokens.css', () => {
  /*
   * The default accent is declared twice: once in `tokens.css`, which paints the
   * first frame before any module has run, and once by `shell/accent.ts`, which
   * paints every frame after it. A visitor who never changed the accent must not
   * see the colour jump on load — that is the same flash the theme code goes out
   * of its way to avoid — so the two have to agree, and this is what says so.
   */
  const SELECTOR = { light: ':root', dark: ":root[data-theme='dark']" } as const;

  for (const theme of ['light', 'dark'] as const) {
    it(`declare the default preset's ${theme} palette`, () => {
      const declared = tokensOf(SELECTOR[theme]);
      const palette = presetById(DEFAULT_ACCENT_ID)[theme];

      expect(declared.get('--accent')).toBe(palette.accent);
      expect(declared.get('--accent-hover')).toBe(palette.hover);
      expect(declared.get('--accent-soft')).toBe(palette.soft);
      expect(declared.get('--control')).toBe(palette.control);
      expect(declared.get('--text-on-accent')).toBe(palette.on);
    });

    it(`aim the ${theme} accent at the surface the stylesheet actually uses`, () => {
      expect(tokensOf(SELECTOR[theme]).get('--surface')).toBe(SURFACE[theme]);
    });
  }

  it('say the same thing in the explicit dark rule and the system dark rule', () => {
    /* The two dark blocks are duplicated by hand, which is precisely why this is
       worth asserting: every token has to be edited in both. */
    const explicit = tokensOf(SELECTOR.dark);
    const bySystem = tokensOf(":root:not([data-theme='light'])");

    expect(explicit.size).toBeGreaterThan(0);
    for (const [name, value] of explicit) {
      expect(bySystem.get(name), name).toBe(value);
    }
  });
});
