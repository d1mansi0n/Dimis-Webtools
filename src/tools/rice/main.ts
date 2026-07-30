import '../../styles/app.css';
import './rice.css';

import { el, queryAll, requireElement } from '../../core/dom.js';
import { clamp, parseDecimal, roundToStep } from '../../core/math.js';
import { t } from '../../i18n/index.js';
import { boot } from '../../shell/boot.js';
import {
  CUP_STEP,
  MAX_CUPS,
  MAX_RATIO,
  MIN_RATIO,
  PRESETS,
  convert,
  createRatioStore,
  isValidRatio,
} from './rice.js';

boot({
  start() {
    const ratioStore = createRatioStore();
    let ratio = ratioStore.read();

    const cupsInput = requireElement<HTMLInputElement>('#rice-cups');
    const ratioInput = requireElement<HTMLInputElement>('#rice-ratio');
    const waterOutput = requireElement<HTMLOutputElement>('#rice-water');
    const ratioMessage = requireElement('#rice-ratio-msg');
    const totalText = requireElement('[data-rice="total"]');
    const resultLabel = requireElement('[data-rice="resultLabel"]');
    const presetHost = requireElement('[data-rice="presets"]');

    /* ------------------------------------------------------------ chrome */
    document.title = `${t('tool.rice.name')} · ${t('app.name')}`;
    requireElement('[data-rice="title"]').textContent = t('tool.rice.name');
    requireElement('[data-rice="lead"]').textContent = t('rice.lead');
    requireElement('[data-rice="cupsLabel"]').textContent = t('rice.cups.label');
    requireElement('[data-rice="settings"]').textContent = t('rice.settings');
    requireElement('[data-rice="presetsLabel"]').textContent = t('rice.presets');
    requireElement('[data-rice="customLabel"]').textContent = t('rice.custom.label');
    requireElement('[data-rice="minus"]').setAttribute('aria-label', t('rice.decrease'));
    requireElement('[data-rice="plus"]').setAttribute('aria-label', t('rice.increase'));

    presetHost.replaceChildren(
      ...PRESETS.map((preset) =>
        el('button', {
          class: 'btn',
          attrs: { type: 'button', 'aria-pressed': String(preset.ratio === ratio) },
          data: { ratio: preset.ratio },
          text: t(preset.labelKey),
          on: {
            click: () => {
              applyRatio(preset.ratio, true);
            },
          },
        }),
      ),
    );

    ratioInput.value = String(ratio);

    /* ----------------------------------------------------------- rendering */

    function render(): void {
      resultLabel.textContent = t('rice.result.label', { ratio: String(ratio) });

      for (const button of queryAll<HTMLButtonElement>('[data-ratio]', presetHost)) {
        button.setAttribute('aria-pressed', String(Number(button.dataset['ratio']) === ratio));
      }

      const cups = parseDecimal(cupsInput.value);
      if (cups === undefined || cups < 0) {
        waterOutput.textContent = '0.00';
        totalText.textContent = '';
        return;
      }

      const { water, total } = convert(clamp(cups, 0, MAX_CUPS), ratio);
      waterOutput.textContent = water.toFixed(2);
      totalText.textContent = cups > 0 ? t('rice.total', { total: total.toFixed(2) }) : '';
    }

    let messageTimer: number | undefined;

    function applyRatio(next: number, announce: boolean): void {
      ratio = next;
      ratioInput.value = String(next);

      const saved = ratioStore.write(next);
      if (!saved.ok) {
        showMessage(
          saved.error.kind === 'quota-exceeded' ? t('storage.full') : t('storage.failed'),
          false,
        );
      } else if (announce) {
        showMessage(t('rice.saved'), true);
      }
      render();
    }

    function showMessage(text: string, isSuccess: boolean): void {
      ratioMessage.textContent = text;
      ratioMessage.className = isSuccess ? 'msg msg--ok' : 'msg msg--err';
      window.clearTimeout(messageTimer);
      messageTimer = window.setTimeout(() => {
        ratioMessage.textContent = '';
      }, 2500);
    }

    /* ------------------------------------------------------------ wiring */

    cupsInput.addEventListener('input', render);

    ratioInput.addEventListener('input', () => {
      const parsed = parseDecimal(ratioInput.value);
      if (parsed !== undefined && isValidRatio(parsed)) {
        /* Store the value but leave the field alone: rewriting it mid-typing
           would fight the user's cursor. */
        ratio = parsed;
        const saved = ratioStore.write(parsed);
        showMessage(saved.ok ? t('rice.saved') : t('storage.failed'), saved.ok);
        render();
      } else if (ratioInput.value.trim() !== '') {
        showMessage(t('rice.invalid', { min: MIN_RATIO, max: MAX_RATIO }), false);
      }
    });

    function step(delta: number): void {
      const current = parseDecimal(cupsInput.value) ?? 0;
      cupsInput.value = String(clamp(roundToStep(current + delta, CUP_STEP), 0, MAX_CUPS));
      render();
    }

    requireElement('[data-rice="minus"]').addEventListener('click', () => {
      step(-CUP_STEP);
    });
    requireElement('[data-rice="plus"]').addEventListener('click', () => {
      step(CUP_STEP);
    });

    render();
  },
});
