/**
 * The four lines of setup every page shares.
 *
 * Each tool's `main.ts` calls `boot()` and then does its own work, so the order
 * of the shared steps — theme before first paint, language on the document
 * element, app bar, storage warning — cannot drift between pages.
 */

import { el, onReady, requireElement } from '../core/dom.js';
import { isPersistent } from '../core/storage.js';
import { applyDocumentLanguage, t } from '../i18n/index.js';
import { applyAccent } from './accent.js';
import { mountAppBar } from './appbar.js';
import { applyTheme } from './theme.js';

export interface BootOptions {
  /** False on the hub, where a link back to the hub would be circular. */
  readonly showHomeLink?: boolean;
  /** The page's own setup, run once the document is ready. */
  readonly start: () => void;
}

export function boot(options: BootOptions): void {
  /* Applied immediately rather than on DOMContentLoaded: the module is deferred,
     so this still lands before the user sees anything, and waiting would risk a
     flash of the wrong theme. */
  applyTheme();
  applyAccent();
  applyDocumentLanguage();

  onReady(() => {
    labelSkipLink();
    mountAppBar({ showHomeLink: options.showHomeLink ?? true });
    warnIfStorageIsEphemeral();
    options.start();
  });
}

/** The skip link is the first focusable element on every page; label it. */
function labelSkipLink(): void {
  const link = document.querySelector('.skip-link');
  if (link !== null) link.textContent = t('nav.skip');
}

/**
 * Tell the user when their browser is refusing to persist anything.
 *
 * Silently losing a saved game or a day of tracked time on tab close is a far
 * worse outcome than a one-line warning, and the tools are still usable in this
 * state, so it is a notice rather than an error.
 */
function warnIfStorageIsEphemeral(): void {
  if (isPersistent()) return;

  const main = requireElement('main');
  main.prepend(
    el('p', {
      class: ['card', 'msg', 'msg--warn'],
      attrs: { role: 'status' },
      text: t('storage.ephemeral'),
    }),
  );
}
