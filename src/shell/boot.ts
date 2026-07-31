/**
 * The four lines of setup every page shares.
 *
 * Each tool's `main.ts` calls `boot()` and then does its own work, so the order
 * of the shared steps — theme before first paint, language on the document
 * element, app bar, storage warning — cannot drift between pages.
 */

import { el, onReady, requireElement } from '../core/dom.js';
import { isPersistent } from '../core/storage.js';
import { trustedWorkerUrl } from '../core/trusted-types.js';
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
    try {
      labelSkipLink();
      mountAppBar({ showHomeLink: options.showHomeLink ?? true });
      warnIfStorageIsEphemeral();
      options.start();
    } catch (cause) {
      reportStartupFailure(cause);
    }
    registerServiceWorker();
  });
}

/**
 * Register the offline worker, after the page itself has finished loading.
 *
 * Deliberately outside the `try` above and last in the sequence: offline support
 * is an enhancement, and a browser that refuses it — or a registration that
 * fails behind a corporate proxy — must not cost the visitor the tool they came
 * for.
 *
 * Only in a production build. In development the worker would serve yesterday's
 * modules over the top of Vite's hot reload, which is a uniquely confusing way
 * to lose an afternoon.
 */
function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener(
    'load',
    () => {
      const url = new URL('sw.js', new URL(import.meta.env.BASE_URL, window.location.href));

      /* `register()` is a Trusted Types sink in the same way the `Worker`
         constructor is, so it goes through the one policy this site defines —
         which refuses anything not on our own origin. */
      navigator.serviceWorker
        .register(trustedWorkerUrl(url), {
          type: 'module',
          scope: import.meta.env.BASE_URL,
        })
        .catch((cause: unknown) => {
          console.warn('[boot] offline support is unavailable', cause);
        });
    },
    { once: true },
  );
}

/**
 * Show that the page failed to start, rather than leaving it half-built.
 *
 * Every tool's `start()` calls `requireElement` a dozen times, and that throws
 * on purpose: a missing hook means the markup and the module have drifted, which
 * is a programmer error worth failing loudly on. Loudly, though, meant an
 * exception in the console and — for the visitor — a page with an app bar, no
 * tool, and no indication that anything was wrong.
 *
 * Every other failure here is surfaced: storage that will not persist gets a
 * notice, a save that will not write says so, a corrupt value is quarantined and
 * explained. Startup is now held to the same standard. The original error is
 * re-reported to the console, because the message a visitor should see and the
 * detail a developer needs are not the same text.
 */
function reportStartupFailure(cause: unknown): void {
  console.error('[boot] this page failed to start', cause);

  /* `querySelector`, not `requireElement`: this is the error path, and throwing
     a second time while reporting the first would lose both. */
  const main = document.querySelector('main');
  if (main === null) return;

  main.prepend(
    el('p', {
      class: ['card', 'msg', 'msg--err'],
      attrs: { role: 'alert' },
      text: t('boot.failed'),
    }),
  );
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
