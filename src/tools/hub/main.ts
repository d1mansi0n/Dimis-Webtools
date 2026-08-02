import '../../styles/app.css';
import './hub.css';

import { el, requireElement } from '../../core/dom.js';
import { TOOLS } from '../../config/site.js';
import { t } from '../../i18n/index.js';
import { boot } from '../../shell/boot.js';
import { icon } from '../../shell/icons.js';

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
      { class: 'tool-link', attrs: { href: `${tool.id}/` } },
      /* Decoration; the tool's name right beside it is the real label, which is
         why the icon itself is `aria-hidden`. */
      el('span', { class: 'tool-link__icon' }, icon(tool.icon, { size: 22 })),
      el(
        'span',
        { class: 'tool-link__body' },
        el('span', { class: 'tool-link__name', text: t(`tool.${tool.id}.name`) }),
        el('span', { class: 'tool-link__desc', text: t(`tool.${tool.id}.desc`) }),
      ),
      el('span', { class: 'tool-link__go' }, icon('forward', { size: 16 })),
    ),
  );
}
