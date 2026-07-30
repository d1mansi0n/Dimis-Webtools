/**
 * Confirmation dialogs built on the native `<dialog>` element.
 *
 * Replaces `window.confirm`, which blocks the whole event loop, cannot be styled
 * or translated consistently, and is suppressible by the browser in ways that
 * silently turn a destructive action into an unguarded one. `<dialog>` brings
 * focus trapping, Escape-to-dismiss, backdrop inertness and the right ARIA
 * semantics without any of that being reimplemented here.
 */

import { el } from '../core/dom.js';
import { t } from '../i18n/index.js';

export interface ConfirmOptions {
  readonly message: string;
  /** Label for the affirmative button. Defaults to a translated "Yes". */
  readonly confirmLabel?: string;
  /** Label for the dismissive button. Defaults to a translated "No". */
  readonly cancelLabel?: string;
  /** Styles the affirmative button as destructive. */
  readonly destructive?: boolean;
}

/**
 * Ask the user to confirm an action.
 *
 * Resolves `true` only if they explicitly confirm; Escape, the backdrop and the
 * cancel button all resolve `false`, so the safe answer is the default one.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;

    const cancel = el('button', {
      class: 'btn',
      attrs: { type: 'button' },
      text: options.cancelLabel ?? t('common.no'),
      on: {
        click: () => {
          dialog.close();
        },
      },
    });

    const confirm = el('button', {
      class: ['btn', options.destructive === true ? 'btn--danger' : 'btn--primary'],
      attrs: { type: 'button' },
      text: options.confirmLabel ?? t('common.yes'),
      on: {
        click: () => {
          answer = true;
          dialog.close();
        },
      },
    });

    const dialog = el(
      'dialog',
      {},
      el('p', { text: options.message }),
      el('div', { class: 'dialog__actions' }, cancel, confirm),
    );

    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(answer);
    });

    document.body.append(dialog);
    dialog.showModal();
    /* Focus the safe choice, so an accidental Return does not delete anything. */
    cancel.focus();
  });
}
