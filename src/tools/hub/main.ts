import '../../styles/app.css';
import './hub.css';

import { el, requireElement } from '../../core/dom.js';
import { TOOLS } from '../../config/site.js';
import { t } from '../../i18n/index.js';
import { boot } from '../../shell/boot.js';

const REPOSITORY_URL = 'https://github.com/d1mansi0n/Dimis-Webtools';

boot({
  showHomeLink: false,
  start() {
    document.title = t('app.name');
    requireElement('[data-hub="title"]').textContent = t('app.name');
    requireElement('[data-hub="tagline"]').textContent = t('app.tagline');

    requireElement('[data-hub="tools"]').replaceChildren(...TOOLS.map(toolCard));

    requireElement('[data-hub="footer"]').replaceChildren(
      el('p', { text: t('hub.privacy') }),
      el('p', {}, el('a', { attrs: { href: REPOSITORY_URL }, text: t('hub.source') })),
    );
  },
});

function toolCard(tool: (typeof TOOLS)[number]): HTMLElement {
  return el(
    'li',
    {},
    el(
      'a',
      { class: 'tool-card', attrs: { href: `${tool.id}/` } },
      /* The emoji is decoration; the tool's name right beside it is the real
         label, so hiding it keeps screen readers from announcing "abacus". */
      el('span', { class: 'tool-card__icon', attrs: { 'aria-hidden': 'true' }, text: tool.icon }),
      el(
        'span',
        { class: 'tool-card__body' },
        el('span', { class: 'tool-card__name', text: t(`tool.${tool.id}.name`) }),
        el('span', { class: 'tool-card__desc', text: t(`tool.${tool.id}.desc`) }),
      ),
    ),
  );
}
