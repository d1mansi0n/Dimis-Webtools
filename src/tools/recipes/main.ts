import '../../styles/app.css';
import './recipes.css';

import { el, requireElement, type Child } from '../../core/dom.js';
import { formatNumber } from '../../core/format.js';
import { intlTag, locale, plural, t } from '../../i18n/index.js';
import { boot } from '../../shell/boot.js';
import { confirmDialog } from '../../shell/dialog.js';
import { MEAL_ORDER, RECIPES, STAPLES, type Recipe } from './data.js';
import {
  clampPersons,
  countLines,
  createRecipeStore,
  portionsFor,
  recipesOf,
  selectedRecipes,
  shoppingList,
  stapleCheckId,
  type Quantity,
} from './recipes.js';

/** A card's "3/7" readout, refreshed in place as ticks change. */
interface Counter {
  readonly element: HTMLElement;
  readonly ids: readonly string[];
}

boot({
  start() {
    const store = createRecipeStore();
    const saved = store.read();

    let persons = clampPersons(saved.persons);
    const selected = new Set(saved.selected);
    const checked = new Set(saved.checked);

    /* `<details>` elements are rebuilt whenever the person count changes, so
       which ones were open has to be remembered here rather than in the DOM. */
    const openRecipes = new Set<string>();

    let currentTab: 'recipes' | 'shopping' = 'recipes';

    /* Rebuilt by every shopping render; the tick handler updates them in place
       so that ticking a box never re-renders the list under the user's finger. */
    let counters: Counter[] = [];
    let allCheckIds: readonly string[] = [];
    let progressFill: HTMLElement | undefined;
    let progressLabel: HTMLElement | undefined;

    /* --------------------------------------------------------------- elements */
    const recipesPanel = requireElement('#recipes-panel-recipes');
    const shoppingPanel = requireElement('#recipes-panel-shopping');
    const recipesTab = requireElement<HTMLButtonElement>('#recipes-tab-recipes');
    const shoppingTab = requireElement<HTMLButtonElement>('#recipes-tab-shopping');
    const personsCount = requireElement('[data-recipes="personsCount"]');
    const minusButton = requireElement<HTMLButtonElement>('[data-recipes="personsMinus"]');
    const plusButton = requireElement<HTMLButtonElement>('[data-recipes="personsPlus"]');
    const feedback = requireElement('[data-recipes="feedback"]');

    /* ----------------------------------------------------------------- chrome */
    document.title = `${t('tool.recipes.name')} · ${t('app.name')}`;
    requireElement('[data-recipes="title"]').textContent = t('tool.recipes.name');
    requireElement('[data-recipes="lead"]').textContent = t('recipes.lead');
    requireElement('#recipes-persons-label').textContent = t('recipes.persons.label');
    minusButton.setAttribute('aria-label', t('recipes.persons.decrease'));
    plusButton.setAttribute('aria-label', t('recipes.persons.increase'));
    recipesTab.textContent = t('recipes.tab.recipes');
    shoppingTab.textContent = t('recipes.tab.shopping');

    /* ------------------------------------------------------------ persistence */
    function persist(): void {
      const result = store.write({
        persons,
        selected: [...selected],
        checked: [...checked],
      });
      feedback.textContent = result.ok
        ? ''
        : result.error.kind === 'quota-exceeded'
          ? t('storage.full')
          : t('storage.failed');
    }

    /* ---------------------------------------------------------------- labels */
    function quantityLabel(quantity: Quantity): string {
      const value = formatNumber(quantity.value, intlTag(), 2);
      switch (quantity.unit) {
        case 'g':
          return t('recipes.unit.g', { count: value });
        case 'ml':
          return t('recipes.unit.ml', { count: value });
        case 'l':
          return t('recipes.unit.l', { count: value });
        case 'piece':
          return plural('recipes.unit.piece', quantity.value, { count: value });
        case 'can':
          return plural('recipes.unit.can', quantity.value, { count: value });
        case 'bunch':
          return plural('recipes.unit.bunch', quantity.value, { count: value });
      }
    }

    /* ------------------------------------------------------------ recipe tab */
    function recipeCard(recipe: Recipe): HTMLElement {
      const chosen = selected.has(recipe.id);

      const toggle = el('button', {
        class: 'btn',
        attrs: { type: 'button', 'aria-pressed': chosen },
        text: chosen ? t('recipes.added') : t('recipes.add'),
        on: {
          click: () => {
            if (chosen) selected.delete(recipe.id);
            else selected.add(recipe.id);
            persist();
            render();
          },
        },
      });

      const details = el(
        'details',
        { class: 'recipe__details', attrs: { open: openRecipes.has(recipe.id) } },
        el('summary', { text: t('recipes.method') }),
        el(
          'div',
          { class: 'stack recipe__body' },
          el('h4', {
            class: 'recipe__label',
            /* The heading states the person count so the scaled amounts below it
               are never read as "per portion" by mistake. */
            text: plural('recipes.ingredients', persons),
          }),
          el(
            'ul',
            { class: 'recipe__ingredients' },
            ...portionsFor(recipe, persons).map((portion) =>
              el(
                'li',
                {},
                el('span', {
                  class: 'recipe__amount numeric',
                  text: quantityLabel(portion.quantity),
                }),
                el('span', { text: portion.ingredient.name[locale()] }),
              ),
            ),
          ),
          el('h4', { class: 'recipe__label', text: t('recipes.steps') }),
          el(
            'ol',
            { class: 'recipe__steps' },
            ...recipe.steps[locale()].map((step) => el('li', { text: step })),
          ),
        ),
      );

      details.addEventListener('toggle', () => {
        if (details.open) openRecipes.add(recipe.id);
        else openRecipes.delete(recipe.id);
      });

      return el(
        'article',
        { class: 'card recipe' },
        el(
          'div',
          { class: 'recipe__head' },
          el('span', {
            class: 'recipe__icon',
            attrs: { 'aria-hidden': 'true' },
            text: recipe.icon,
          }),
          el('h3', { class: 'recipe__name', text: recipe.name[locale()] }),
          toggle,
        ),
        details,
      );
    }

    function renderRecipesPanel(): void {
      const summary = el(
        'section',
        { class: 'card stack' },
        el(
          'div',
          { class: 'recipes-summary' },
          el('h2', { text: t('recipes.collection.title') }),
          el('span', { class: 'badge', text: plural('recipes.selected', selected.size) }),
        ),
        el('p', { class: 'note', text: t('recipes.collection.hint') }),
        el(
          'div',
          { class: 'cluster' },
          el('button', {
            class: 'btn',
            attrs: { type: 'button' },
            text: t('recipes.selectAll'),
            on: {
              click: () => {
                for (const recipe of RECIPES) selected.add(recipe.id);
                persist();
                render();
              },
            },
          }),
          el('button', {
            class: 'btn',
            attrs: { type: 'button' },
            text: t('recipes.clearSelection'),
            on: {
              click: () => {
                selected.clear();
                persist();
                render();
              },
            },
          }),
        ),
      );

      const sections = MEAL_ORDER.map((meal) =>
        el(
          'section',
          { class: 'stack' },
          el('h2', { class: 'recipes-meal', text: t(`recipes.meal.${meal}`) }),
          ...recipesOf(meal).map(recipeCard),
        ),
      );

      recipesPanel.replaceChildren(summary, ...sections);
    }

    /* ---------------------------------------------------------- shopping tab */
    function item(options: {
      readonly checkId: string;
      readonly name: string;
      readonly detail: string;
      readonly badge?: Child;
    }): HTMLElement {
      const isChecked = checked.has(options.checkId);

      const box = el('input', { attrs: { type: 'checkbox', checked: isChecked } });

      const row = el(
        'li',
        { class: ['recipes-item', isChecked && 'is-checked'] },
        el(
          'label',
          { class: 'recipes-item__label' },
          box,
          el(
            'span',
            { class: 'recipes-item__text' },
            el('span', { class: 'recipes-item__name', text: options.name }),
            el('span', { class: 'recipes-item__detail numeric', text: options.detail }),
          ),
          options.badge,
        ),
      );

      box.addEventListener('change', () => {
        if (box.checked) checked.add(options.checkId);
        else checked.delete(options.checkId);
        row.classList.toggle('is-checked', box.checked);
        refreshCounts();
        persist();
      });

      return row;
    }

    function itemCard(options: {
      readonly title: string;
      readonly note?: string;
      readonly ids: readonly string[];
      readonly rows: readonly HTMLElement[];
    }): HTMLElement {
      const count = el('span', { class: 'recipes-count numeric' });
      counters.push({ element: count, ids: options.ids });

      return el(
        'section',
        { class: 'card stack' },
        el('div', { class: 'recipes-summary' }, el('h2', { text: options.title }), count),
        options.note !== undefined && el('p', { class: 'note', text: options.note }),
        el('ul', { class: 'recipes-items' }, ...options.rows),
      );
    }

    function renderShoppingPanel(): void {
      counters = [];

      const groups = shoppingList(selectedRecipes(selected), persons);
      const stapleIds = STAPLES.map((staple) => stapleCheckId(staple.id));
      allCheckIds = [
        ...groups.flatMap((group) => group.lines.map((line) => line.checkId)),
        ...stapleIds,
      ];

      progressFill = el('div', { class: 'recipes-progress__fill' });
      progressLabel = el('p', { class: 'note numeric' });

      const meta = el(
        'section',
        { class: 'card stack' },
        el('div', { class: 'recipes-progress', attrs: { 'aria-hidden': 'true' } }, progressFill),
        progressLabel,
        el(
          'ul',
          { class: 'recipes-legend' },
          el(
            'li',
            {},
            el('span', {
              class: 'recipes-dot recipes-dot--fresh',
              attrs: { 'aria-hidden': 'true' },
            }),
            t('recipes.legend.fresh'),
          ),
          el(
            'li',
            {},
            el('span', {
              class: 'recipes-dot recipes-dot--stable',
              attrs: { 'aria-hidden': 'true' },
            }),
            t('recipes.legend.stable'),
          ),
        ),
      );

      const groupCards = groups.map((group) =>
        itemCard({
          title: t(`recipes.category.${group.category}`),
          ids: group.lines.map((line) => line.checkId),
          rows: group.lines.map((line) =>
            item({
              checkId: line.checkId,
              name: line.ingredient.name[locale()],
              detail: quantityLabel(line.quantity),
              badge: el('span', {
                class: ['badge', line.ingredient.fresh ? 'badge--fresh' : 'badge--stable'],
                text: line.ingredient.fresh ? t('recipes.fresh') : t('recipes.stable'),
              }),
            }),
          ),
        }),
      );

      const staplesCard = itemCard({
        title: t('recipes.staples.title'),
        note: t('recipes.staples.note'),
        ids: stapleIds,
        rows: STAPLES.map((staple) =>
          item({
            checkId: stapleCheckId(staple.id),
            name: staple.name[locale()],
            detail: staple.note[locale()],
          }),
        ),
      });

      const reset = el(
        'div',
        { class: 'cluster recipes-actions' },
        el('button', {
          class: ['btn', 'btn--danger'],
          attrs: { type: 'button' },
          text: t('recipes.resetChecks'),
          on: {
            click: () => {
              void (async () => {
                const confirmed = await confirmDialog({
                  message: t('recipes.confirmReset'),
                  destructive: true,
                });
                if (!confirmed) return;
                checked.clear();
                persist();
                render();
              })();
            },
          },
        }),
      );

      shoppingPanel.replaceChildren(
        meta,
        ...(countLines(groups) === 0
          ? [
              el(
                'section',
                { class: 'card' },
                el('p', { class: 'empty', text: t('recipes.empty') }),
              ),
            ]
          : groupCards),
        staplesCard,
        reset,
      );

      refreshCounts();
    }

    /** Update every counter and the progress bar from the current ticks. */
    function refreshCounts(): void {
      for (const counter of counters) {
        const done = counter.ids.filter((id) => checked.has(id)).length;
        counter.element.textContent = t('recipes.count', {
          done,
          total: counter.ids.length,
        });
      }

      const total = allCheckIds.length;
      const done = allCheckIds.filter((id) => checked.has(id)).length;
      if (progressLabel !== undefined) {
        progressLabel.textContent = t('recipes.progress', { done, total });
      }
      if (progressFill !== undefined) {
        /* A custom property rather than `style.width`, as the Sudoku picker does:
           the stylesheet keeps the layout and only the one number crosses over. */
        const percent = total === 0 ? 0 : (100 * done) / total;
        progressFill.style.setProperty('--fill', `${String(percent)}%`);
      }
    }

    /* ---------------------------------------------------------------- chrome */
    function showTab(tab: 'recipes' | 'shopping'): void {
      currentTab = tab;
      recipesTab.setAttribute('aria-pressed', String(tab === 'recipes'));
      shoppingTab.setAttribute('aria-pressed', String(tab === 'shopping'));
      recipesPanel.hidden = tab !== 'recipes';
      shoppingPanel.hidden = tab !== 'shopping';
    }

    function setPersons(next: number): void {
      const clamped = clampPersons(next);
      if (clamped === persons) return;
      persons = clamped;
      persist();
      render();
    }

    function render(): void {
      personsCount.textContent = formatNumber(persons, intlTag(), 0);
      renderRecipesPanel();
      renderShoppingPanel();
      showTab(currentTab);
    }

    /* --------------------------------------------------------------- wiring */
    recipesTab.addEventListener('click', () => {
      showTab('recipes');
    });
    shoppingTab.addEventListener('click', () => {
      showTab('shopping');
    });
    minusButton.addEventListener('click', () => {
      setPersons(persons - 1);
    });
    plusButton.addEventListener('click', () => {
      setPersons(persons + 1);
    });

    render();
  },
});
