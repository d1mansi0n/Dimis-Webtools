/**
 * Colour maths for the accent palette.
 *
 * The site is themed from a single accent colour, and everything else that
 * colour touches — the hover shade, the soft tint behind a badge, the checkbox
 * fill, the text printed on top of it — has to keep working in both the light
 * and the dark theme. Hand-picking six values per accent for two themes is how
 * palettes end up failing contrast in the one combination nobody looked at, so
 * they are derived here instead, and the derivation checks its own work against
 * WCAG rather than trusting that a nice-looking hue is a legible one.
 *
 * The work happens in OKLCH because sRGB lightness is not perceptual: dropping
 * the lightness of a blue and a yellow by the same amount in HSL moves one of
 * them far more than the other, and blending towards white in sRGB drags hues
 * through grey. OKLCH keeps a hue recognisable while the lightness moves, which
 * is exactly what a derived palette needs.
 *
 * Contrast targets follow WCAG 2.1 AA for body text (4.5:1), because accent
 * colours are used as text here — a badge, a statistic, a link — not only as
 * decoration.
 */

import { clamp } from './math.js';

/** An sRGB colour with channels in `0..1`. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** A colour in OKLCH: perceptual lightness `0..1`, chroma, hue in degrees. */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export type ThemeMode = 'light' | 'dark';

/** The contrast ratio WCAG 2.1 asks of body text. */
const AA_TEXT = 4.5;

/**
 * The surface each theme's accent has to stay legible on.
 *
 * These mirror `--surface` in `tokens.css`, and they are the stricter of the two
 * backgrounds in both directions: the light theme's page background is darker
 * than its cards, the dark theme's is darker still. A colour that passes here
 * passes everywhere. `accent.test.ts` asserts that the stylesheet still agrees.
 */
export const THEME_SURFACE: Readonly<Record<ThemeMode, string>> = {
  light: '#ffffff',
  dark: '#1c1c1c',
};

/**
 * The two candidates for text drawn on top of the accent.
 *
 * Mirrors `--text-on-accent` in `tokens.css`, which flips between them by theme.
 * `derivePalette` picks whichever wins on contrast rather than assuming that the
 * light theme's accent is always the dark one — a pale yellow accent breaks that
 * assumption immediately.
 */
const ON_ACCENT_CANDIDATES = ['#ffffff', '#141414'] as const;

const HEX = /^#[0-9a-f]{6}$/i;

/** Parse `#rrggbb`. Returns `undefined` for anything else, including `#rgb`. */
export function parseHexColor(input: string): Rgb | undefined {
  if (!HEX.test(input)) return undefined;
  const value = Number.parseInt(input.slice(1), 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

/** Format as lowercase `#rrggbb`, clamping channels that left the gamut. */
export function formatHexColor(rgb: Rgb): string {
  const channel = (value: number): string =>
    Math.round(clamp(value, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

/* ------------------------------------------------------------------ contrast */

const toLinear = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const toGamma = (value: number): number =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

/** Relative luminance as defined by WCAG 2.1. */
export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * toLinear(clamp(rgb.r, 0, 1)) +
    0.7152 * toLinear(clamp(rgb.g, 0, 1)) +
    0.0722 * toLinear(clamp(rgb.b, 0, 1))
  );
}

/** WCAG contrast ratio, between 1 and 21. Order of the arguments is irrelevant. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/* --------------------------------------------------------------------- OKLCH */

/*
 * Björn Ottosson's OKLab matrices. The intermediate `l`/`m`/`s` values are cone
 * responses, not the OKLab lightness, which is why they are named apart from it.
 */

function rgbToOklab(rgb: Rgb): { readonly l: number; readonly a: number; readonly b: number } {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  const long = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const medium = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const short = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);

  return {
    l: 0.210_454_255_3 * long + 0.793_617_785 * medium - 0.004_072_046_8 * short,
    a: 1.977_998_495_1 * long - 2.428_592_205 * medium + 0.450_593_709_9 * short,
    b: 0.025_904_037_1 * long + 0.782_771_766_2 * medium - 0.808_675_766 * short,
  };
}

function oklabToRgb(lab: { readonly l: number; readonly a: number; readonly b: number }): Rgb {
  const long = (lab.l + 0.396_337_777_4 * lab.a + 0.215_803_757_3 * lab.b) ** 3;
  const medium = (lab.l - 0.105_561_345_8 * lab.a - 0.063_854_172_8 * lab.b) ** 3;
  const short = (lab.l - 0.089_484_177_5 * lab.a - 1.291_485_548 * lab.b) ** 3;

  return {
    r: toGamma(4.076_741_662_1 * long - 3.307_711_591_3 * medium + 0.230_969_929_2 * short),
    g: toGamma(-1.268_438_004_6 * long + 2.609_757_401_1 * medium - 0.341_319_396_5 * short),
    b: toGamma(-0.004_196_086_3 * long - 0.703_418_614_7 * medium + 1.707_614_701 * short),
  };
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const lab = rgbToOklab(rgb);
  const c = Math.hypot(lab.a, lab.b);
  /* Hue is meaningless at zero chroma, and an arbitrary value there would be
     amplified the moment chroma is raised again. Report it as 0. */
  const h = c < 1e-6 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { l: lab.l, c, h };
}

/* A channel this far outside 0..1 is a rounding artefact, not a real excursion. */
const GAMUT_EPSILON = 1e-4;

const inGamut = (rgb: Rgb): boolean =>
  [rgb.r, rgb.g, rgb.b].every(
    (value) => value >= -GAMUT_EPSILON && value <= 1 + GAMUT_EPSILON && Number.isFinite(value),
  );

/**
 * Convert to sRGB, reducing chroma until the colour fits in the gamut.
 *
 * Most OKLCH triples do not exist in sRGB — a vivid blue simply cannot be as
 * light as a vivid yellow. Clamping the channels instead would silently shift
 * both the hue and the lightness, and the lightness is the one property the
 * contrast search depends on, so chroma is what gives way. A binary search on
 * the chroma factor lands within a thousandth in a dozen steps.
 */
export function oklchToRgb(color: Oklch): Rgb {
  const l = clamp(color.l, 0, 1);
  const hueRadians = (color.h * Math.PI) / 180;
  const at = (chroma: number): Rgb =>
    oklabToRgb({ l, a: Math.cos(hueRadians) * chroma, b: Math.sin(hueRadians) * chroma });

  const full = at(color.c);
  if (inGamut(full)) return full;

  let low = 0;
  let high = color.c;
  for (let step = 0; step < 12; step++) {
    const middle = (low + high) / 2;
    if (inGamut(at(middle))) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return at(low);
}

/* ------------------------------------------------------------------- palette */

/** The custom properties a chosen accent replaces. */
export interface AccentPalette {
  readonly accent: string;
  readonly accentHover: string;
  readonly accentSoft: string;
  readonly control: string;
  readonly textOnAccent: string;
}

/**
 * Per-theme targets for the derivation.
 *
 * The lightness figures are starting points, not results: the searches below
 * move away from them until the contrast requirements hold. The chroma ceilings
 * are what stop a fully saturated seed from turning the page into a highlighter
 * — the accent is a colour the eye lives with on every control of every page.
 * */
const TARGETS: Readonly<
  Record<
    ThemeMode,
    {
      readonly accentL: number;
      readonly accentChroma: number;
      readonly hoverShift: number;
      readonly controlShift: number;
      readonly softL: number;
      readonly softChroma: number;
      /** Direction the accent moves in when it is not yet legible enough. */
      readonly rescue: 1 | -1;
    }
  >
> = {
  light: {
    accentL: 0.55,
    accentChroma: 0.2,
    hoverShift: -0.06,
    controlShift: 0.07,
    softL: 0.965,
    softChroma: 0.03,
    rescue: -1,
  },
  dark: {
    accentL: 0.8,
    accentChroma: 0.14,
    hoverShift: 0.07,
    controlShift: -0.06,
    softL: 0.31,
    softChroma: 0.06,
    rescue: 1,
  },
};

/** Step size for the contrast searches. Finer than the eye, coarse enough to be quick. */
const SEARCH_STEP = 0.005;

/**
 * Walk the lightness from `start` in the given direction until `accept` holds.
 *
 * The endpoints are black and white, both of which satisfy any contrast
 * requirement against a mid-tone surface, so the walk always terminates with a
 * usable colour; the final value is returned even if nothing was accepted, so
 * the function cannot produce `undefined` for a caller to guard against.
 */
function walkLightness(
  start: number,
  direction: 1 | -1,
  chroma: number,
  hue: number,
  accept: (candidate: Rgb) => boolean,
): Rgb {
  let candidate = oklchToRgb({ l: start, c: chroma, h: hue });
  for (let step = 0; step < 200; step++) {
    if (accept(candidate)) return candidate;
    const next = start + direction * SEARCH_STEP * (step + 1);
    if (next < 0 || next > 1) break;
    candidate = oklchToRgb({ l: next, c: chroma, h: hue });
  }
  return candidate;
}

/**
 * Derive the full set of accent tokens for one theme from a seed colour.
 *
 * Only the hue and — up to a ceiling — the chroma of the seed survive. Its
 * lightness is discarded on purpose: a colour picked in a swatch grid or from
 * the operating system's colour dialog carries no information about how legible
 * it would be as text on this site's surfaces, and honouring it is what produces
 * an accent that vanishes into a white card.
 */
export function derivePalette(seed: string, theme: ThemeMode): AccentPalette {
  const target = TARGETS[theme];
  const parsed = parseHexColor(seed) ?? { r: 0, g: 0, b: 0 };
  const { c, h } = rgbToOklch(parsed);

  const surface = parseHexColor(THEME_SURFACE[theme]) ?? { r: 1, g: 1, b: 1 };
  const chroma = Math.min(c, target.accentChroma);

  /* The soft tint is fixed first: the accent has to be legible *on* it — a badge
     is accent-coloured text on an accent-soft pill — so it is an input to the
     accent search rather than something derived from the result. */
  const soft = oklchToRgb({
    l: target.softL,
    c: Math.min(c, target.softChroma),
    h,
  });

  const accent = walkLightness(
    target.accentL,
    target.rescue,
    chroma,
    h,
    (candidate) =>
      contrastRatio(candidate, surface) >= AA_TEXT && contrastRatio(candidate, soft) >= AA_TEXT,
  );
  const accentL = rgbToOklch(accent).l;

  const onAccent = ON_ACCENT_CANDIDATES.map((hex) => ({
    hex,
    rgb: parseHexColor(hex) ?? { r: 1, g: 1, b: 1 },
  }))
    .map((candidate) => ({ ...candidate, ratio: contrastRatio(accent, candidate.rgb) }))
    .sort(
      (first, second) => second.ratio - first.ratio,
    )[0] ?? /* istanbul ignore next -- the candidate list is a non-empty literal */ {
    hex: '#ffffff',
    rgb: { r: 1, g: 1, b: 1 },
    ratio: 1,
  };

  /* `--control` is deliberately off the accent: it fills checkboxes and range
     tracks, and at 21px the full-strength accent reads as a black square rather
     than as a colour. It still carries the tick, so it walks back towards the
     accent until the tick is legible on it. */
  const control = walkLightness(
    accentL + target.controlShift,
    target.rescue,
    chroma,
    h,
    (candidate) => contrastRatio(candidate, onAccent.rgb) >= AA_TEXT,
  );

  return {
    accent: formatHexColor(accent),
    accentHover: formatHexColor(oklchToRgb({ l: accentL + target.hoverShift, c: chroma, h })),
    accentSoft: formatHexColor(soft),
    control: formatHexColor(control),
    textOnAccent: onAccent.hex,
  };
}
