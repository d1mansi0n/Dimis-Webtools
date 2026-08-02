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

  /* The bar always names the site, and on a tool page that name is also the way
     back to the hub. An empty left slot is what left the settings looking like
     three controls adrift in the whitespace above the page. */
  replaceChildren(
    host,
    el(
      'div',
      { class: 'appbar__inner' },
      brand(options.showHomeLink),
      el('span', { class: 'appbar__spacer' }),
      el('div', { class: 'appbar__settings' }, themeButton, accentButton(), languageSwitcher()),
    ),
  );
}

/**
 * The site's name at the left of the bar, which is also the way back to the hub.
 *
 * Absent on the hub itself: the page's own display heading says the same words
 * twenty pixels below, and a link there would point at the page it is already
 * on. The bar's rule is what stops the settings reading as adrift there, which
 * is the job the old empty left slot was failing at.
 *
 * The chevron and the accessible name both say "back", because the visible word
 * is the site's name rather than a direction.
 */
function brand(showHomeLink: boolean): HTMLElement | false {
  if (!showHomeLink) return false;

  return el(
    'a',
    {
      class: 'appbar__brand',
      attrs: { href: '../', 'aria-label': t('nav.home') },
    },
    icon('back', { size: 16 }),
    el('span', { text: t('app.name') }),
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
    class: 'select--bare',
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
