/**
 * Light/dark theme selection.
 *
 * Three states rather than two: `system` follows `prefers-color-scheme`, while
 * `light` and `dark` override it. A two-state toggle cannot express "I want
 * light mode on a device set to dark", which is a real preference.
 *
 * Only Sudoku had a theme toggle before, and it stored its own key. This is
 * site-wide and stored once.
 */

import { defineStore } from '../core/storage.js';
import { literals } from '../core/schema.js';

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

const store = defineStore<ThemeChoice>({
  key: 'theme',
  decoder: literals(...THEME_CHOICES),
  fallback: () => 'system',
  legacy: {
    /* Sudoku 2.0 wrote a bare `light`/`dark` string here. It was not JSON, so it
       is parsed as a plain value rather than decoded. */
    key: 'sudokuTheme',
    decoder: (input) =>
      input === 'dark' || input === 'light'
        ? { ok: true, value: input }
        : { ok: false, error: 'not a theme' },
  },
});

let choice: ThemeChoice = store.read();

export function theme(): ThemeChoice {
  return choice;
}

/**
 * Write the choice onto the root element.
 *
 * `system` removes the attribute entirely so the `prefers-color-scheme` media
 * query in `tokens.css` takes over, rather than freezing whichever theme was
 * active at the time.
 */
export function applyTheme(): void {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }
}

export function setTheme(next: ThemeChoice): void {
  choice = next;
  void store.write(next);
  applyTheme();
}

/** Advance to the next choice, wrapping around. */
export function cycleTheme(): ThemeChoice {
  const index = THEME_CHOICES.indexOf(choice);
  const next = THEME_CHOICES[(index + 1) % THEME_CHOICES.length] ?? 'system';
  setTheme(next);
  return next;
}
