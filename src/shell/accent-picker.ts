/**
 * The accent colour picker.
 *
 * A modal `<dialog>` for the same reasons `confirmDialog` is one: focus
 * trapping, Escape, an inert page behind it and correct semantics, none of it
 * reimplemented.
 *
 * Choices apply immediately rather than on an OK button. The whole point of the
 * setting is what the page looks like, and the page is visible around the
 * dialog, so previewing *is* choosing.
 */

import { ACCENT_PRESETS } from '../config/accent.js';
import { el, replaceChildren } from '../core/dom.js';
import { t } from '../i18n/index.js';
import { accent, accentPalette, setAccent } from './accent.js';

export function openAccentPicker(): void {
  const grid = el('div', { class: 'accent-grid' });

  /* Rebuilt rather than mutated on each change: the swatches show what each
     preset looks like *in the active theme*, so their colours are as much a
     function of the current state as their pressed state is. */
  const render = (): void => {
    replaceChildren(
      grid,
      ...ACCENT_PRESETS.map((preset) => {
        const button = el(
          'button',
          {
            class: ['btn', 'accent-swatch'],
            /* The string, not the boolean: `el()` renders `true` as a bare
               attribute, which is right for `disabled` and wrong for an ARIA
               state — `aria-pressed=""` is neither pressed nor unpressed, and
               the `[aria-pressed='true']` rule that styles the selection would
               never match. */
            attrs: { type: 'button', 'aria-pressed': preset.id === accent() ? 'true' : 'false' },
          },
          el('span', { class: 'accent-swatch__dot', attrs: { 'aria-hidden': 'true' } }),
          el('span', { text: t(preset.label) }),
        );
        button.style.setProperty('--swatch', accentPalette(preset.id).accent);
        button.addEventListener('click', () => {
          setAccent(preset.id);
          render();
        });
        return button;
      }),
    );
  };
  render();

  const dialog = el(
    'dialog',
    { class: 'accent-dialog' },
    el('h2', { text: t('accent.title') }),
    el('p', { class: 'note', text: t('accent.hint') }),
    grid,
    el(
      'div',
      { class: 'dialog__actions' },
      el('button', {
        class: ['btn', 'btn--primary'],
        attrs: { type: 'button' },
        text: t('common.close'),
        on: {
          click: () => {
            dialog.close();
          },
        },
      }),
    ),
  );

  dialog.addEventListener('close', () => {
    dialog.remove();
  });

  document.body.append(dialog);
  dialog.showModal();
}
