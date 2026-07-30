import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  derivePalette,
  formatHexColor,
  oklchToRgb,
  parseHexColor,
  relativeLuminance,
  rgbToOklch,
  THEME_SURFACE,
  type AccentPalette,
  type ThemeMode,
} from './color.js';

const rgb = (hex: string) => {
  const parsed = parseHexColor(hex);
  expect(parsed, `${hex} should parse`).toBeDefined();
  return parsed!;
};

const ratio = (first: string, second: string): number => contrastRatio(rgb(first), rgb(second));

/** Seeds spanning the hue circle, plus the two that break naive derivations. */
const SEEDS = [
  '#2563eb',
  '#0d9488',
  '#2f8f4e',
  '#d97706',
  '#e11d48',
  '#6d28d9',
  /* A pure yellow: light enough that "darken the accent for the light theme"
     alone leaves it at 1.9:1 on white. */
  '#ffff00',
  /* Black and white carry no hue at all, and a picker will hand them over. */
  '#000000',
  '#ffffff',
  '#64748b',
];

const THEMES: ThemeMode[] = ['light', 'dark'];

describe('parseHexColor', () => {
  it('reads the three channels of #rrggbb', () => {
    expect(parseHexColor('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHexColor('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
    expect(parseHexColor('#ff8000')).toEqual({ r: 1, g: 128 / 255, b: 0 });
  });

  it('accepts uppercase', () => {
    expect(parseHexColor('#AABBCC')).toEqual(parseHexColor('#aabbcc'));
  });

  it('rejects anything that is not six hex digits', () => {
    for (const input of ['', 'aabbcc', '#abc', '#gggggg', '#aabbccdd', 'red', '#aabbc']) {
      expect(parseHexColor(input), input).toBeUndefined();
    }
  });
});

describe('formatHexColor', () => {
  it('round-trips through parsing', () => {
    for (const hex of SEEDS) {
      expect(formatHexColor(rgb(hex))).toBe(hex);
    }
  });

  it('pads a channel that needs a leading zero', () => {
    expect(formatHexColor({ r: 0, g: 1 / 255, b: 0 })).toBe('#000100');
  });

  it('clamps channels that left the gamut instead of emitting nonsense', () => {
    expect(formatHexColor({ r: 1.4, g: -0.2, b: 0.5 })).toBe('#ff0080');
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG figures for the extremes', () => {
    expect(ratio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(ratio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('does not depend on the order of its arguments', () => {
    expect(ratio('#2563eb', '#ffffff')).toBeCloseTo(ratio('#ffffff', '#2563eb'), 10);
  });

  it('agrees with the published ratio for a mid-tone pair', () => {
    /* #767676 on white is the canonical "smallest passing grey", 4.54:1. */
    expect(ratio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('relativeLuminance', () => {
  it('spans 0 to 1 between black and white', () => {
    expect(relativeLuminance(rgb('#000000'))).toBeCloseTo(0, 10);
    expect(relativeLuminance(rgb('#ffffff'))).toBeCloseTo(1, 10);
  });

  it('weights green far above blue, as the eye does', () => {
    expect(relativeLuminance(rgb('#00ff00'))).toBeGreaterThan(relativeLuminance(rgb('#0000ff')));
  });
});

describe('OKLCH conversion', () => {
  it('round-trips every seed through OKLCH and back', () => {
    for (const hex of SEEDS) {
      expect(formatHexColor(oklchToRgb(rgbToOklch(rgb(hex)))), hex).toBe(hex);
    }
  });

  it('orders greys by lightness', () => {
    const lightness = ['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff'].map(
      (hex) => rgbToOklch(rgb(hex)).l,
    );
    expect([...lightness].sort((a, b) => a - b)).toEqual(lightness);
  });

  it('reports no hue for a grey, rather than an arbitrary one', () => {
    expect(rgbToOklch(rgb('#808080')).c).toBeLessThan(1e-6);
    expect(rgbToOklch(rgb('#808080')).h).toBe(0);
  });

  it('reduces chroma to stay in gamut instead of clipping the lightness', () => {
    /* No blue this light exists in sRGB. Clamping the channels would have
       produced a lighter, hue-shifted colour; reducing chroma keeps the
       lightness the contrast search relies on. */
    const asked = { l: 0.9, c: 0.3, h: 264 };
    const produced = rgbToOklch(oklchToRgb(asked));
    expect(produced.l).toBeCloseTo(asked.l, 2);
    expect(produced.c).toBeLessThan(asked.c);
    expect(produced.h).toBeCloseTo(asked.h, 0);
  });

  it('clamps a lightness outside 0..1 rather than producing a broken colour', () => {
    expect(formatHexColor(oklchToRgb({ l: 2, c: 0.1, h: 30 }))).toBe('#ffffff');
    expect(formatHexColor(oklchToRgb({ l: -1, c: 0.1, h: 30 }))).toBe('#000000');
  });
});

describe('derivePalette', () => {
  const palettes = SEEDS.flatMap((seed) =>
    THEMES.map((theme) => ({ seed, theme, palette: derivePalette(seed, theme) })),
  );

  it('produces six valid colours for every seed and theme', () => {
    for (const { seed, theme, palette } of palettes) {
      const entries: [string, string][] = Object.entries(palette);
      expect(entries).toHaveLength(6);
      for (const [name, value] of entries) {
        expect(parseHexColor(value), `${seed}/${theme}/${name} is not a colour`).toBeDefined();
      }
    }
  });

  it('keeps the accent legible on the surface it sits on', () => {
    for (const { seed, theme, palette } of palettes) {
      expect(
        ratio(palette.accent, THEME_SURFACE[theme]),
        `${seed}/${theme}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the accent legible on its own soft tint', () => {
    /* The badge is accent-coloured text on an accent-soft pill, which is the
       pairing a palette picked by eye gets wrong first. */
    for (const { seed, theme, palette } of palettes) {
      expect(ratio(palette.accent, palette.accentSoft), `${seed}/${theme}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('keeps text legible on the accent and on the control fill', () => {
    for (const { seed, theme, palette } of palettes) {
      expect(
        ratio(palette.accent, palette.textOnAccent),
        `${seed}/${theme}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        ratio(palette.control, palette.textOnAccent),
        `${seed}/${theme} control`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('moves the hover shade away from the surface, not towards it', () => {
    /* A hover state that lowers contrast looks like the control went inactive. */
    for (const { seed, theme, palette } of palettes) {
      expect(ratio(palette.accentHover, THEME_SURFACE[theme]), `${seed}/${theme}`).toBeGreaterThan(
        ratio(palette.accent, THEME_SURFACE[theme]),
      );
    }
  });

  it('keeps the soft tint and the glow close to the theme background', () => {
    for (const { seed, theme, palette } of palettes) {
      const towards = theme === 'light' ? '#ffffff' : '#000000';
      expect(ratio(palette.accentSoft, towards), `${seed}/${theme} soft`).toBeLessThan(2);
      expect(ratio(palette.accentGlow, towards), `${seed}/${theme} glow`).toBeLessThan(3);
    }
  });

  it('keeps the hue of the seed', () => {
    /* The lightness is discarded and the chroma is capped, but a user who picks
       orange must not be handed brown-green. */
    const hueDistance = (first: number, second: number): number => {
      const raw = Math.abs(first - second) % 360;
      return raw > 180 ? 360 - raw : raw;
    };

    for (const { seed, theme, palette } of palettes) {
      const source = rgbToOklch(rgb(seed));
      if (source.c < 0.02) continue;
      const produced = rgbToOklch(rgb(palette.accent));
      expect(hueDistance(source.h, produced.h), `${seed}/${theme}`).toBeLessThan(12);
    }
  });

  it('derives a grey palette from a grey seed instead of inventing a hue', () => {
    const palette = derivePalette('#808080', 'light');
    expect(rgbToOklch(rgb(palette.accent)).c).toBeLessThan(0.02);
  });

  it('falls back to a usable palette for a colour it cannot parse', () => {
    /* Callers validate first, but a derivation that threw here would take a page
       down over a setting. */
    const palette: AccentPalette = derivePalette('not a colour', 'light');
    expect(ratio(palette.accent, THEME_SURFACE.light)).toBeGreaterThanOrEqual(4.5);
  });

  it('is deterministic', () => {
    expect(derivePalette('#2563eb', 'dark')).toEqual(derivePalette('#2563eb', 'dark'));
  });

  it('gives the dark theme a lighter accent than the light theme', () => {
    for (const seed of SEEDS) {
      const light = rgbToOklch(rgb(derivePalette(seed, 'light').accent)).l;
      const dark = rgbToOklch(rgb(derivePalette(seed, 'dark').accent)).l;
      expect(dark, seed).toBeGreaterThan(light);
    }
  });
});
