/**
 * The bar at the top of every page: a way back to the hub, a theme control and
 * a language switcher.
 *
 * Rendered from script rather than repeated in six HTML files, so the markup and
 * its labels stay in one place and are translated by construction.
 */

import { el, requireElement } from '../core/dom.js';
import { LOCALES, locale, setLocale, t, type Locale } from '../i18n/index.js';
import { cycleTheme, theme, type ThemeChoice } from './theme.js';

const THEME_ICON: Readonly<Record<ThemeChoice, string>> = {
  system: '🖥️',
  light: '☀️',
  dark: '🌙',
};

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
    text: THEME_ICON[theme()],
  });
  themeButton.addEventListener('click', () => {
    themeButton.textContent = THEME_ICON[cycleTheme()];
  });

  host.replaceChildren(
    options.showHomeLink
      ? el('a', { class: 'appbar__home', attrs: { href: '../' }, text: `← ${t('nav.home')}` })
      : el('span', { class: 'appbar__home', text: t('app.name') }),
    el('span', { class: 'appbar__spacer' }),
    themeButton,
    languageSwitcher(),
  );
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
