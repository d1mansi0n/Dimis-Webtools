/**
 * The accent colour picker.
 *
 * A modal `<dialog>` for the same reasons `confirmDialog` is one: focus
 * trapping, Escape, an inert page behind it and correct semantics, none of it
 * reimplemented. It sits beside the theme button in the app bar, because the two
 * are the same kind of setting.
 *
 * Choices apply immediately rather than on an OK button. The whole point of the
 * setting is what the page looks like, and the page is visible around the
 * dialog, so previewing *is* choosing.
 */

import { ACCENT_PRESETS } from '../config/accent.js';
import { el, queryAll, replaceChildren } from '../core/dom.js';
import { t } from '../i18n/index.js';
import { accent, accentPalette, setAccent } from './accent.js';

export function openAccentPicker(): void {
  const custom = el('input', {
    id: 'accent-custom',
    attrs: { type: 'color', value: accent(), 'aria-describedby': 'accent-hint' },
  });

  const grid = el('div', { class: 'accent-grid' });

  /* Rebuilt rather than mutated on each change: the swatches show what each
     preset looks like *in the active theme*, so their colours are as much a
     function of the current state as their pressed state is. */
  const render = (): void => {
    replaceChildren(
      grid,
      ...ACCENT_PRESETS.map((preset) => {
        const name = t(preset.label);
        const selected = preset.seed === accent();
        const button = el(
          'button',
          {
            class: ['btn', 'accent-swatch'],
            /* The string, not the boolean: `el()` renders `true` as a bare
               attribute, which is right for `disabled` and wrong for an ARIA
               state — `aria-pressed=""` is neither pressed nor unpressed, and
               the `[aria-pressed='true']` rule that styles the selection would
               never match. */
            attrs: { type: 'button', 'aria-pressed': selected ? 'true' : 'false' },
          },
          el('span', {
            class: 'accent-swatch__dot',
            attrs: { 'aria-hidden': 'true' },
          }),
          el('span', { text: name }),
        );
        button.style.setProperty('--swatch', accentPalette(preset.seed).accent);
        button.addEventListener('click', () => {
          setAccent(preset.seed);
          custom.value = accent();
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
    el('p', { id: 'accent-hint', class: 'note', text: t('accent.hint') }),
    grid,
    el(
      'div',
      { class: 'accent-custom' },
      el('label', { attrs: { for: 'accent-custom' }, text: t('accent.custom') }),
      custom,
    ),
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

  /* `input` previews without writing; `change` is the colour the user settled
     on, and the only one worth a trip to storage. */
  custom.addEventListener('input', () => {
    setAccent(custom.value, { persist: false });
    for (const pressed of queryAll('[aria-pressed="true"]', grid)) {
      pressed.setAttribute('aria-pressed', 'false');
    }
  });
  custom.addEventListener('change', () => {
    setAccent(custom.value);
    render();
  });

  /* Escape and the backdrop close the dialog without a `change` ever firing on
     some platforms, so the colour in the input is committed here as well. */
  dialog.addEventListener('close', () => {
    setAccent(custom.value);
    dialog.remove();
  });

  document.body.append(dialog);
  dialog.showModal();
}
