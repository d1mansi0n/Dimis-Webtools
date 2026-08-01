import '../../styles/app.css';
import './sugar.css';

import { el, replaceChildren, requireElement } from '../../core/dom.js';
import { formatNumber } from '../../core/format.js';
import { parseDecimal } from '../../core/math.js';
import { intlTag, locale, t } from '../../i18n/index.js';
import { boot } from '../../shell/boot.js';
import { icon } from '../../shell/icons.js';
import { analyse, compare, MAX_CUBE_ICONS } from './sugar.js';

boot({
  start() {
    const input = requireElement<HTMLInputElement>('#sugar-grams');
    const hint = requireElement('#sugar-hint');
    const resultCard = requireElement('#sugar-result');
    const compareCard = requireElement('#sugar-compare');
    const cubesValue = requireElement('[data-sugar="cubes"]');
    const percentValue = requireElement('[data-sugar="percent"]');
    const cubeStrip = requireElement('[data-sugar="cubeStrip"]');
    const compareList = requireElement('[data-sugar="compareList"]');

    document.title = `${t('tool.sugar.name')} · ${t('app.name')}`;
    requireElement('[data-sugar="title"]').textContent = t('tool.sugar.name');
    requireElement('[data-sugar="lead"]').textContent = t('sugar.lead');
    requireElement('[data-sugar="inputLabel"]').textContent = t('sugar.input.label');
    requireElement('[data-sugar="cubesLabel"]').textContent = t('sugar.cubes.label');
    requireElement('[data-sugar="percentLabel"]').textContent = t('sugar.who.label');
    requireElement('[data-sugar="compareTitle"]').textContent = t('sugar.compare.title');
    requireElement('[data-sugar="compareNote"]').textContent = t('sugar.compare.note');

    const format = (value: number): string => formatNumber(value, intlTag(), 1);

    function render(): void {
      const raw = input.value.trim();
      const grams = parseDecimal(raw);

      if (raw === '' || grams === undefined || grams < 0) {
        resultCard.hidden = true;
        compareCard.hidden = true;
        hint.textContent = raw === '' ? '' : t('sugar.invalid');
        return;
      }

      hint.textContent = '';

      const breakdown = analyse(grams);
      cubesValue.textContent = format(breakdown.cubes);
      percentValue.textContent = `${format(breakdown.percentOfDailyMax)} %`;
      /* Drawn rather than spelled with an emoji: the ice-cube glyph rendered at
         a different size, weight and colour on every platform, and none of them
         looked like the sugar cube the number beside it is counting. */
      const shown = Math.min(breakdown.wholeCubes, MAX_CUBE_ICONS);
      replaceChildren(
        cubeStrip,
        ...Array.from({ length: shown }, () => icon('cube', { size: 18 })),
        breakdown.wholeCubes > MAX_CUBE_ICONS &&
          el('span', {
            class: 'sugar-cubes__overflow',
            text: t('sugar.cubes.overflow', { total: format(breakdown.wholeCubes) }),
          }),
      );
      resultCard.hidden = false;

      const { window, closest } = compare(grams);
      compareList.replaceChildren(
        ...window.map((food) =>
          el(
            'li',
            { attrs: { 'data-closest': food.id === closest.id } },
            el('span', { text: food.name[locale()] }),
            el('span', {
              class: 'sugar-compare__amount',
              text: `${format(food.sugarPer100g)} g`,
            }),
          ),
        ),
      );
      compareCard.hidden = false;
    }

    input.addEventListener('input', render);
    render();
  },
});
