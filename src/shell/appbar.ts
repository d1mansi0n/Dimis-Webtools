/**
 * The bar at the top of every page: a way back to the hub, a theme control, an
 * accent colour control and a language switcher.
 *
 * Rendered from script rather than repeated in six HTML files, so the markup and
 * its labels stay in one place and are translated by construction.
 */

import { el, replaceChildren, requireElement } from '../core/dom.js';
import { LOCALES, locale, setLocale, t, type Locale } from '../i18n/index.js';
import { openAccentPicker } from './accent-picker.js';
import { icon } from './icons.js';
import { cycleTheme, theme } from './theme.js';

export interface AppBarOptions {
  /**
   * Whether to show the link back to the hub. Off on the hub itself, where it
   * would point at the current page.
   */
  readonly showHomeLink: boolean;
}

/**
 * Mount the app bar into the page's `<header class="appbar">`.
 *
 * The header exists in the static HTML so the layout does not shift when script
 * runs; this fills it in.
 */
export function mountAppBar(options: AppBarOptions): void {
  const host = requireElement('.appbar');

  const themeButton = el('button', {
    class: ['btn', 'btn--ghost', 'btn--icon'],
    attrs: { type: 'button', title: t('sudoku.theme'), 'aria-label': t('sudoku.theme') },
  });
  /* The icon *is* the state — monitor, sun, moon — so it is replaced rather than
     restyled when the choice cycles. The accessible name never changes, because
     the button always does the same thing. */
  const showTheme = (): void => {
    themeButton.replaceChildren(icon(theme()));
  };
  showTheme();
  themeButton.addEventListener('click', () => {
    cycleTheme();
    showTheme();
  });

  /* On the hub the left slot stays empty: it used to repeat the site name a
     few pixels above the `<h1>` that already says it. Elsewhere it is the way
     back, which is the only thing in this bar that is not a setting. */
  replaceChildren(
    host,
    options.showHomeLink &&
      el('a', { class: 'appbar__home', attrs: { href: '../' }, text: `← ${t('nav.home')}` }),
    el('span', { class: 'appbar__spacer' }),
    themeButton,
    accentButton(),
    languageSwitcher(),
  );
}

/**
 * The button that opens the accent picker.
 *
 * Its icon is a dot filled with `--accent` itself, so the control shows the
 * setting it changes and needs no glyph that would have to mean "colour" in
 * every language.
 */
function accentButton(): HTMLElement {
  const button = el(
    'button',
    {
      class: ['btn', 'btn--ghost', 'btn--icon'],
      attrs: { type: 'button', title: t('accent.open'), 'aria-label': t('accent.open') },
    },
    el('span', { class: 'accent-dot', attrs: { 'aria-hidden': 'true' } }),
  );

  button.addEventListener('click', () => {
    openAccentPicker();
  });

  return button;
}

/**
 * A native `<select>` for the language.
 *
 * Changing it reloads the page. Every visible string is produced at render time,
 * and a reload re-runs all of it correctly for the price of a few milliseconds
 * on a page with no server round-trip — far less machinery than a reactive
 * re-render, and impossible to get subtly wrong.
 */
function languageSwitcher(): HTMLElement {
  const select = el('select', {
    attrs: { 'aria-label': t('nav.language') },
    children: LOCALES.map((code) =>
      el('option', {
        attrs: { value: code, selected: code === locale() },
        text: t(code === 'de' ? 'lang.de' : 'lang.en'),
      }),
    ),
  });

  select.addEventListener('change', () => {
    const chosen = select.value;
    if (isLocale(chosen)) {
      setLocale(chosen);
      window.location.reload();
    }
  });

  return select;
}

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
