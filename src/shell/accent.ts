/**
 * The site's accent colour.
 *
 * The palette in `tokens.css` used to hardcode one indigo, which every button,
 * link, badge and focus ring on every page inherited. The colour is a matter of
 * taste, so it is a setting: six presets, each written out per theme in
 * `config/accent.ts`.
 *
 * Only the preset's id is stored, so a palette that is later re-tuned reaches
 * everyone who chose it rather than freezing at the values current when they
 * chose. An unrecognised id — a hand-edited storage entry, or a preset removed
 * in a later version — falls back to the default rather than reaching
 * `style.setProperty`.
 */

import { ACCENT_IDS, DEFAULT_ACCENT_ID, presetById, type AccentPalette } from '../config/accent.js';
import { string } from '../core/schema.js';
import { err, ok, type Result } from '../core/result.js';
import { defineStore } from '../core/storage.js';
import { effectiveTheme, onThemeChange } from './theme.js';

/** The custom properties `applyAccent` writes onto the root element. */
const PROPERTIES: Readonly<Record<keyof AccentPalette, string>> = {
  accent: '--accent',
  hover: '--accent-hover',
  soft: '--accent-soft',
  control: '--control',
  on: '--text-on-accent',
};

/**
 * A stored preset id.
 *
 * Validated rather than trusted: the value ends up selecting a palette that is
 * written straight into `style.setProperty`, and the only thing between a
 * hand-edited `localStorage` entry and that call is this decoder.
 */
const presetId = (input: unknown, path = ''): Result<string> => {
  const text = string(input, path);
  if (!text.ok) return text;
  return ACCENT_IDS.includes(text.value)
    ? ok(text.value)
    : err(`${path === '' ? 'value' : path}: expected one of ${ACCENT_IDS.join(', ')}`);
};

const store = defineStore<string>({
  key: 'accent',
  decoder: presetId,
  fallback: () => DEFAULT_ACCENT_ID,
});

let chosen = store.read();

/** The stored preset id, which is what the picker shows as selected. */
export function accent(): string {
  return chosen;
}

/** The palette the current choice produces for the active theme. */
export function accentPalette(id: string = chosen): AccentPalette {
  return presetById(id)[effectiveTheme()];
}

/** Write the chosen palette onto the root element, overriding `tokens.css`. */
export function applyAccent(): void {
  const palette = accentPalette();
  const root = document.documentElement.style;
  for (const [name, property] of Object.entries(PROPERTIES)) {
    root.setProperty(property, palette[name as keyof AccentPalette]);
  }
}

export function setAccent(id: string): void {
  if (!ACCENT_IDS.includes(id)) return;
  chosen = id;
  void store.write(chosen);
  applyAccent();
}

/* Each preset carries a palette per theme, so the applied one is rewritten
   whenever the effective theme changes — including the device switching to
   night mode while `system` is selected, which changes no attribute for a
   stylesheet to react to. */
onThemeChange(applyAccent);
