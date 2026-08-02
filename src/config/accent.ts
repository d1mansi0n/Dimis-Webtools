/**
 * The accent colours the site offers.
 *
 * Six fixed palettes, written out. There used to be a 350-line colour library
 * behind this: the presets were *seeds*, and `core/color.ts` converted each one
 * to OKLCH, clamped its chroma, and binary-searched its lightness against the
 * theme's surface until it met 4.5:1 — at run time, on every page load, so that
 * the operating system's colour dialog could also be offered and any hex a user
 * typed would come out legible.
 *
 * That is a lot of machinery for a choice between six colours. The search only
 * ever ran on these six seeds plus whatever anyone typed, and nobody typed. So
 * the six were derived once, checked, and frozen here; the custom-colour field
 * went with the library. `build/accent.test.ts` re-checks every value below
 * against the same WCAG formula, so a hand-edited colour that fails still fails
 * the build — the guarantee is kept, the apparatus that produced it is not.
 *
 * Each palette is the five custom properties `shell/accent.ts` writes onto the
 * root element, per theme. `--accent-soft` is the tint the accent is drawn on
 * (a badge, a pressed button), so the accent has to be legible on it as well as
 * on the page; `--control` is a lighter shade for `accent-color`, because at
 * 20px a checkbox filled with the full-strength accent reads as a black square.
 */

import type { TranslationKey } from '../i18n/en.js';

/** The five properties a palette supplies, per theme. */
export interface AccentPalette {
  readonly accent: string;
  readonly hover: string;
  readonly soft: string;
  readonly control: string;
  readonly on: string;
}

export interface AccentPreset {
  /** Stable identifier. Stored, and the suffix of the translation key. */
  readonly id: string;
  readonly label: TranslationKey;
  readonly light: AccentPalette;
  readonly dark: AccentPalette;
}

/* A non-empty tuple, so `ACCENT_PRESETS[0]` is a preset rather than a maybe and
   the fallback below needs no assertion to say what is obviously true. */
export const ACCENT_PRESETS: readonly [AccentPreset, ...AccentPreset[]] = [
  {
    id: 'ocean',
    label: 'accent.preset.ocean',
    light: {
      accent: '#2d67e4',
      hover: '#1b53cf',
      soft: '#eef4ff',
      control: '#346fed',
      on: '#ffffff',
    },
    dark: {
      accent: '#9bbeff',
      hover: '#bed5ff',
      soft: '#20304f',
      control: '#7da9ff',
      on: '#141414',
    },
  },
  {
    id: 'teal',
    label: 'accent.preset.teal',
    light: {
      accent: '#007d73',
      hover: '#006a61',
      soft: '#defbf6',
      control: '#00857a',
      on: '#ffffff',
    },
    dark: {
      accent: '#65d4c6',
      hover: '#7debdd',
      soft: '#003934',
      control: '#4fc0b3',
      on: '#141414',
    },
  },
  {
    id: 'forest',
    label: 'accent.preset.forest',
    light: {
      accent: '#1b8040',
      hover: '#006e31',
      soft: '#e6fae9',
      control: '#248646',
      on: '#ffffff',
    },
    dark: {
      accent: '#79d690',
      hover: '#90eda6',
      soft: '#163920',
      control: '#66c27e',
      on: '#141414',
    },
  },
  {
    id: 'amber',
    label: 'accent.preset.amber',
    light: {
      accent: '#a85a00',
      hover: '#904c00',
      soft: '#fff0e6',
      control: '#b36000',
      on: '#ffffff',
    },
    dark: {
      accent: '#ffa65d',
      hover: '#ffc79d',
      soft: '#46280d',
      control: '#eb9247',
      on: '#141414',
    },
  },
  {
    id: 'rose',
    label: 'accent.preset.rose',
    light: {
      accent: '#cc2444',
      hover: '#b50034',
      soft: '#ffefef',
      control: '#da354f',
      on: '#ffffff',
    },
    dark: {
      accent: '#ff9fa2',
      hover: '#ffc2c3',
      soft: '#4a2325',
      control: '#f6838a',
      on: '#141414',
    },
  },
  {
    id: 'violet',
    label: 'accent.preset.violet',
    light: {
      accent: '#7950d9',
      hover: '#693cc5',
      soft: '#f3f1ff',
      control: '#835be5',
      on: '#ffffff',
    },
    dark: {
      accent: '#c0b0ff',
      hover: '#d5ccff',
      soft: '#312a4c',
      control: '#ae99fb',
      on: '#141414',
    },
  },
];

/** Every preset id, for the storage decoder. */
export const ACCENT_IDS = ACCENT_PRESETS.map((preset) => preset.id);

/**
 * The accent a visitor who has never chosen one sees.
 *
 * `tokens.css` declares this preset's two palettes so the first paint is already
 * the right colour rather than a shade swapped a frame later;
 * `build/accent.test.ts` fails if the stylesheet and this table drift apart.
 */
export const DEFAULT_ACCENT_ID = 'ocean';

/**
 * The palette for a stored id.
 *
 * Falls back to the first preset rather than throwing: the id comes from
 * `localStorage`, and one written by a version that offered a preset this one
 * does not should cost the visitor their choice, not the page.
 */
export function presetById(id: string): AccentPreset {
  return ACCENT_PRESETS.find((preset) => preset.id === id) ?? ACCENT_PRESETS[0];
}
