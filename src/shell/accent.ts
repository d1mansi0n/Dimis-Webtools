/**
 * The site's accent colour.
 *
 * The palette in `tokens.css` used to hardcode one indigo, which every button,
 * link, badge and focus ring on every page inherited. The colour is a matter of
 * taste, so it is a setting: six presets and the operating system's own colour
 * picker for anything else.
 *
 * Only the seed colour is stored. Everything the accent implies — the hover
 * shade, the soft tint, the control fill, the text drawn on top of it — is
 * derived per theme by `core/color.ts`, which is also what keeps a freely chosen
 * colour from landing somewhere illegible. Storing the derived values instead
 * would freeze them at the version of the derivation that wrote them.
 */

import { DEFAULT_ACCENT } from '../config/accent.js';
import { derivePalette, formatHexColor, parseHexColor, type AccentPalette } from '../core/color.js';
import { err, ok, type Result } from '../core/result.js';
import { string } from '../core/schema.js';
import { defineStore } from '../core/storage.js';
import { effectiveTheme, onThemeChange } from './theme.js';

/** The custom properties `applyAccent` writes onto the root element. */
const PROPERTIES: Readonly<Record<keyof AccentPalette, string>> = {
  accent: '--accent',
  accentHover: '--accent-hover',
  accentSoft: '--accent-soft',
  accentGlow: '--accent-glow',
  control: '--control',
  textOnAccent: '--text-on-accent',
};

/**
 * `#rrggbb`, normalised to lowercase.
 *
 * A colour ends up in a CSS custom property, so it is validated on the way out
 * of storage rather than trusted: the only thing standing between a hand-edited
 * `localStorage` entry and `style.setProperty` is this decoder.
 */
const hexColor = (input: unknown, path = ''): Result<string> => {
  const text = string(input, path);
  if (!text.ok) return text;
  const parsed = parseHexColor(text.value);
  return parsed === undefined
    ? err(`${path === '' ? 'value' : path}: expected a #rrggbb colour, got ${text.value}`)
    : ok(formatHexColor(parsed));
};

const store = defineStore<string>({
  key: 'accent',
  decoder: hexColor,
  fallback: () => DEFAULT_ACCENT,
});

let seed = store.read();

/** The stored seed colour, which is what the picker shows as selected. */
export function accent(): string {
  return seed;
}

/** The colours the current seed produces for a theme. Used to paint the swatches. */
export function accentPalette(seedColor: string = seed): AccentPalette {
  return derivePalette(seedColor, effectiveTheme());
}

/** Write the derived palette onto the root element, overriding `tokens.css`. */
export function applyAccent(): void {
  const palette = accentPalette();
  const root = document.documentElement.style;
  for (const [name, property] of Object.entries(PROPERTIES)) {
    root.setProperty(property, palette[name as keyof AccentPalette]);
  }
}

export interface SetAccentOptions {
  /**
   * Whether to remember the choice. Dragging through the colour picker fires an
   * event per pixel of travel, and only the colour landed on is worth a write.
   */
  readonly persist?: boolean;
}

export function setAccent(next: string, options: SetAccentOptions = {}): void {
  const parsed = parseHexColor(next);
  if (parsed === undefined) return;
  seed = formatHexColor(parsed);
  if (options.persist !== false) void store.write(seed);
  applyAccent();
}

/* The derivation depends on the theme, so the palette is re-derived whenever the
   effective theme changes — including the device switching to night mode while
   `system` is selected, which changes no attribute for a stylesheet to react to. */
onThemeChange(applyAccent);
