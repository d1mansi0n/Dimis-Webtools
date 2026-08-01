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

const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

const DARK_QUERY = '(prefers-color-scheme: dark)';

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

function setTheme(next: ThemeChoice): void {
  choice = next;
  void store.write(next);
  applyTheme();
  announce();
}

/**
 * The theme actually in force, with `system` resolved against the device.
 *
 * CSS never needs this — `prefers-color-scheme` answers it in the stylesheet —
 * but the accent palette is computed in script, and "which of the two token sets
 * am I deriving for" is a question the media query cannot answer from there.
 */
export function effectiveTheme(): Exclude<ThemeChoice, 'system'> {
  if (choice !== 'system') return choice;
  return darkQuery()?.matches === true ? 'dark' : 'light';
}

const listeners: (() => void)[] = [];

/**
 * Subscribe to changes in the *effective* theme.
 *
 * Both sources of change are covered: an explicit switch through `setTheme`, and
 * the device flipping to night mode while `system` is selected. The second one
 * used to need no handling at all, because the media query in `tokens.css` did
 * the work; anything derived in script has to be told.
 */
export function onThemeChange(listener: () => void): void {
  listeners.push(listener);
  watchSystemTheme();
}

function announce(): void {
  for (const listener of listeners) listener();
}

let watching = false;

function watchSystemTheme(): void {
  if (watching) return;
  const query = darkQuery();
  /* `addEventListener` on a MediaQueryList is absent in jsdom and in Safari
     before 14, and neither is a reason to fail: the palette is merely applied
     once and left alone until the next explicit change. */
  if (query === undefined || typeof query.addEventListener !== 'function') return;
  watching = true;
  query.addEventListener('change', announce);
}

function darkQuery(): MediaQueryList | undefined {
  return typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : undefined;
}

/** Advance to the next choice, wrapping around. */
export function cycleTheme(): ThemeChoice {
  const index = THEME_CHOICES.indexOf(choice);
  const next = THEME_CHOICES[(index + 1) % THEME_CHOICES.length] ?? 'system';
  setTheme(next);
  return next;
}
