/**
 * The accent colours the site offers.
 *
 * Kept here, beside the tool catalogue and free of DOM APIs, because three
 * consumers need it: the picker in the app bar, the shell that applies the
 * stored choice, and the build-side test that checks `tokens.css` still declares
 * what the default derives to.
 *
 * These are seeds, not finished colours. Only their hue and — up to a ceiling —
 * their chroma survive: `core/color.ts` derives the six accent tokens for each
 * theme from them, so a preset is a choice of hue rather than of a literal value
 * that would have to be re-tuned for the dark theme by hand.
 */

import type { TranslationKey } from '../i18n/en.js';

export interface AccentPreset {
  /** Stable identifier. Also the suffix of the translation key. */
  readonly id: string;
  readonly seed: string;
  readonly label: TranslationKey;
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'ocean', seed: '#2563eb', label: 'accent.preset.ocean' },
  { id: 'teal', seed: '#0d9488', label: 'accent.preset.teal' },
  { id: 'forest', seed: '#2f8f4e', label: 'accent.preset.forest' },
  { id: 'amber', seed: '#d97706', label: 'accent.preset.amber' },
  { id: 'rose', seed: '#e11d48', label: 'accent.preset.rose' },
  { id: 'violet', seed: '#6d28d9', label: 'accent.preset.violet' },
];

/**
 * The accent a visitor who has never chosen one sees.
 *
 * `tokens.css` declares what this derives to, so that the first paint is already
 * the right colour; `build/tokens.test.ts` fails if the two drift apart.
 */
export const DEFAULT_ACCENT = '#2563eb';
